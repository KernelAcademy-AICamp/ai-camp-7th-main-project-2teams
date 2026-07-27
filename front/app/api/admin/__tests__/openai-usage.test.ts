import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let currentUser: unknown = { id: 'admin-1' }
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser }, error: null }) },
    // withAdmin의 isAdmin()이 호출하는 is_admin RPC — admin-1만 관리자로 취급
    rpc: async () => ({
      data: (currentUser as { id?: string } | null)?.id === 'admin-1',
      error: null,
    }),
  }),
}))

// 실사용 추정용 events 조회 mock — from('events').select().in().gte() 체인
let eventsResult: { data: unknown; error: { message: string } | null } = { data: [], error: null }
// 라우트가 라벨 창(56일) 조회 후 range 구간을 created_at으로 잘라 쓰므로 목 행에도 시각이 필요
const nowIso = new Date().toISOString()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ in: () => ({ gte: async () => eventsResult }) }),
    }),
  }),
}))

import { GET } from '../openai-usage/route'

function req(qs = '') {
  return new Request(`http://t/api/admin/openai-usage${qs}`)
}

describe('GET /api/admin/openai-usage', () => {
  beforeEach(() => {
    currentUser = { id: 'admin-1' }
    eventsResult = { data: [], error: null }
  })
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.OPENAI_ADMIN_KEY
  })

  it('비관리자는 404', async () => {
    currentUser = { id: 'stranger' }
    const res = await GET(req())
    expect(res.status).toBe(404)
  })

  it('키 미설정 시 available:false', async () => {
    const res = await GET(req('?range=30d'))
    const body = await res.json()
    expect(body.available).toBe(false)
    expect(body.totalCostUsd).toBe(0)
  })

  it('Costs API 200 → 비용 합산', async () => {
    process.env.OPENAI_ADMIN_KEY = 'sk-admin-test'
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { results: [{ amount: { value: 0.5 } }] },
            { results: [{ amount: { value: 1.25 } }] },
          ],
        }),
        { status: 200 }
      )
    )
    const res = await GET(req('?range=30d'))
    const body = await res.json()
    expect(body.available).toBe(true)
    expect(body.totalCostUsd).toBeCloseTo(1.75)
  })

  it('amount.value가 numeric string이어도 정상 합산 (실제 OpenAI API 관례)', async () => {
    process.env.OPENAI_ADMIN_KEY = 'sk-admin-test'
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { results: [{ amount: { value: '0.5' } }] },
            { results: [{ amount: { value: '1.25' } }] },
          ],
        }),
        { status: 200 }
      )
    )
    const res = await GET(req('?range=30d'))
    const body = await res.json()
    expect(body.available).toBe(true)
    expect(typeof body.totalCostUsd).toBe('number')
    expect(body.totalCostUsd).toBeCloseTo(1.75)
  })

  it('비200 응답 시 available:false', async () => {
    process.env.OPENAI_ADMIN_KEY = 'sk-admin-test'
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('nope', { status: 401 }))
    const res = await GET(req('?range=30d'))
    const body = await res.json()
    expect(body.available).toBe(false)
  })

  it('fetch 자체 실패(네트워크 에러) 시 available:false', async () => {
    process.env.OPENAI_ADMIN_KEY = 'sk-admin-test'
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))
    const res = await GET(req('?range=30d'))
    expect((await res.json()).available).toBe(false)
  })

  it('JSON 파싱 실패 시 available:false', async () => {
    process.env.OPENAI_ADMIN_KEY = 'sk-admin-test'
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('not-json', { status: 200 }))
    const res = await GET(req('?range=30d'))
    expect((await res.json()).available).toBe(false)
  })

  it('estimated: events 기반 실사용 추정 — 유저별 익명 집계 + user_id 미노출', async () => {
    // 키 미설정(청구액 불가)이어도 추정은 계산됨
    // uuid-a: 저장 2 → $0.0013, uuid-b: 저장 1+검색 1 → $0.00067 → U1=uuid-a
    eventsResult = {
      data: [
        { user_id: 'uuid-a', type: 'bookmark_saved', created_at: nowIso },
        { user_id: 'uuid-a', type: 'bookmark_saved', created_at: nowIso },
        { user_id: 'uuid-b', type: 'bookmark_saved', created_at: nowIso },
        { user_id: 'uuid-b', type: 'search_performed', created_at: nowIso },
      ],
      error: null,
    }
    const res = await GET(req('?range=30d'))
    const body = await res.json()
    expect(body.available).toBe(false) // 키 없음 — 추정만 존재
    expect(body.estimated.saves).toBe(3)
    expect(body.estimated.searches).toBe(1)
    expect(body.estimated.productionCostUsd).toBeCloseTo(3 * 0.00065 + 1 * 0.00002)
    expect(body.estimated.perUser).toEqual([
      { user: 'U1', costUsd: expect.closeTo(0.0013) },
      { user: 'U2', costUsd: expect.closeTo(0.00067) },
    ])
    expect(JSON.stringify(body)).not.toContain('uuid-')
  })

  it('라벨은 range가 아니라 고정 창(56일) 기준 — range 안 활동만으로 U1이 뒤바뀌지 않음', async () => {
    // uuid-a는 10일 전 저장 3건(창 안·range 밖), uuid-b는 오늘 저장 1건.
    // range=1d 비용에는 uuid-b만 잡히지만 라벨은 창 전체 랭킹이라 uuid-b는 U2로 남아야 한다.
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString()
    eventsResult = {
      data: [
        { user_id: 'uuid-a', type: 'bookmark_saved', created_at: tenDaysAgo },
        { user_id: 'uuid-a', type: 'bookmark_saved', created_at: tenDaysAgo },
        { user_id: 'uuid-a', type: 'bookmark_saved', created_at: tenDaysAgo },
        { user_id: 'uuid-b', type: 'bookmark_saved', created_at: nowIso },
      ],
      error: null,
    }
    const res = await GET(req('?range=1d'))
    const body = await res.json()
    expect(body.estimated.saves).toBe(1)
    expect(body.estimated.perUser).toEqual([{ user: 'U2', costUsd: expect.closeTo(0.00065) }])
  })

  it('estimated: events 조회 실패 → null degrade, 청구액 응답은 유지', async () => {
    process.env.OPENAI_ADMIN_KEY = 'sk-admin-test'
    eventsResult = { data: null, error: { message: 'events down' } }
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ results: [{ amount: { value: 2 } }] }] }), { status: 200 }),
    )
    const res = await GET(req('?range=30d'))
    const body = await res.json()
    expect(body.available).toBe(true)
    expect(body.totalCostUsd).toBeCloseTo(2)
    expect(body.estimated).toBeNull()
  })
})
