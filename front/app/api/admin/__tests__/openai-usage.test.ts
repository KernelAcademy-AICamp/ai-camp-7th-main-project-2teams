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

import { GET } from '../openai-usage/route'

function req(qs = '') {
  return new Request(`http://t/api/admin/openai-usage${qs}`)
}

describe('GET /api/admin/openai-usage', () => {
  beforeEach(() => {
    currentUser = { id: 'admin-1' }
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
})
