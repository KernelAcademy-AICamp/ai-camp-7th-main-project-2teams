import { describe, it, expect, vi, beforeEach } from 'vitest'

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

const rpc = vi.fn()
// events 조회(클릭 도트 + 라벨 랭킹용 저장·검색): from('events').select().in().gte() 체인
let eventsResult: { data: unknown; error: { message: string } | null } = { data: [], error: null }
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc,
    from: () => ({
      select: () => ({ in: () => ({ gte: async () => eventsResult }) }),
    }),
  }),
}))

import { GET } from '../metrics/route'

function req() {
  return new Request('http://t/api/admin/metrics')
}

describe('GET /api/admin/metrics', () => {
  beforeEach(() => {
    currentUser = { id: 'admin-1' }
    rpc.mockReset()
    eventsResult = { data: [], error: null }
  })

  it('비관리자는 404', async () => {
    currentUser = { id: 'stranger' }
    const res = await GET(req())
    expect(res.status).toBe(404)
  })

  it('주간 지표를 camelCase로 매핑 반환', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          week: '2026-07-13T00:00:00Z',
          new_saves: '5',
          auto_coverage: '0.8',
          search_success: '0.5',
          active_curators: '3',
          retrieved: '12',
          manual_retags: '2',
        },
      ],
      error: null,
    })

    const res = await GET(req())
    const body = await res.json()

    expect(rpc).toHaveBeenCalledWith('admin_metrics_weekly', { p_weeks: 8 })
    expect(res.status).toBe(200)
    expect(body.metrics[0]).toEqual({
      week: '2026-07-13T00:00:00Z',
      newSaves: 5,
      autoCoverage: 0.8,
      searchSuccess: 0.5,
      activeCurators: 3,
      retrieved: 12,
      manualRetags: 2,
    })
    // 금지 컬럼 부재
    expect(JSON.stringify(body)).not.toContain('embedding')
    expect(JSON.stringify(body)).not.toContain('user_id')
  })

  it('RPC 에러 시 500', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await GET(req())
    expect(res.status).toBe(500)
  })

  it('데이터 없으면 빈 배열', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    const res = await GET(req())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.metrics).toEqual([])
    expect(body.perUser).toEqual([])
  })

  it('perUser: 주간·유저별 집계 + 3순위 이하 기타 합산 + user_id 미노출', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    // 라벨은 사용량(저장·검색) 비용 랭킹: uuid-b 저장 2 → U1, uuid-a 저장 1 → U2, 나머지 기타
    const clickedAt = (d: string) => ({ type: 'search_result_clicked', created_at: d })
    eventsResult = {
      data: [
        { user_id: 'uuid-b', type: 'bookmark_saved', created_at: '2026-07-20T09:00:00Z' },
        { user_id: 'uuid-b', type: 'bookmark_saved', created_at: '2026-07-21T09:00:00Z' },
        { user_id: 'uuid-a', type: 'bookmark_saved', created_at: '2026-07-20T09:00:00Z' },
        { user_id: 'uuid-a', ...clickedAt('2026-07-20T10:00:00Z') }, // 월요일 주 시작
        { user_id: 'uuid-a', ...clickedAt('2026-07-22T10:00:00Z') }, // 같은 주
        { user_id: 'uuid-b', ...clickedAt('2026-07-21T10:00:00Z') },
        { user_id: 'uuid-b', ...clickedAt('2026-07-14T10:00:00Z') }, // 전 주
        { user_id: 'uuid-b', ...clickedAt('2026-07-15T10:00:00Z') },
        { user_id: 'uuid-c', ...clickedAt('2026-07-21T10:00:00Z') },
        { user_id: 'uuid-d', ...clickedAt('2026-07-21T10:00:00Z') },
      ],
      error: null,
    }

    const res = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.perUser).toEqual([
      { week: '2026-07-13T00:00:00.000Z', user: 'U1', count: 2 },
      { week: '2026-07-20T00:00:00.000Z', user: 'U1', count: 1 },
      { week: '2026-07-20T00:00:00.000Z', user: 'U2', count: 2 },
      { week: '2026-07-20T00:00:00.000Z', user: '기타', count: 2 },
    ])
    // 익명화 — 원 user_id가 응답 어디에도 없음
    expect(JSON.stringify(body)).not.toContain('uuid-')
  })

  it('perUser: 라벨은 클릭 수가 아니라 사용량 비용 랭킹 (위젯 간 U1 일치)', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    // uuid-heavy는 클릭 1건뿐이지만 저장 5건으로 사용량 1위 → U1
    // uuid-clicker는 클릭 3건이어도 검색 1건뿐이라 U2
    eventsResult = {
      data: [
        ...Array.from({ length: 5 }, () => ({
          user_id: 'uuid-heavy',
          type: 'bookmark_saved',
          created_at: '2026-07-20T09:00:00Z',
        })),
        { user_id: 'uuid-clicker', type: 'search_performed', created_at: '2026-07-20T09:00:00Z' },
        {
          user_id: 'uuid-heavy',
          type: 'search_result_clicked',
          created_at: '2026-07-20T10:00:00Z',
        },
        ...Array.from({ length: 3 }, () => ({
          user_id: 'uuid-clicker',
          type: 'search_result_clicked',
          created_at: '2026-07-20T10:00:00Z',
        })),
      ],
      error: null,
    }

    const body = await (await GET(req())).json()
    expect(body.perUser).toEqual([
      { week: '2026-07-20T00:00:00.000Z', user: 'U1', count: 1 },
      { week: '2026-07-20T00:00:00.000Z', user: 'U2', count: 3 },
    ])
  })

  it('perUser: events 조회 실패 → 빈 배열 degrade, metrics는 정상 반환', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          week: '2026-07-13T00:00:00Z',
          new_saves: '1',
          auto_coverage: '1',
          search_success: '0',
          active_curators: '1',
          retrieved: '0',
          manual_retags: '0',
        },
      ],
      error: null,
    })
    eventsResult = { data: null, error: { message: 'events down' } }

    const res = await GET(req())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.metrics).toHaveLength(1)
    expect(body.perUser).toEqual([])
  })
})
