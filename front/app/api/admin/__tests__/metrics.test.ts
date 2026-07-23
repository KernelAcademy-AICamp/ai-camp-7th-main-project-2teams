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
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc }),
}))

import { GET } from '../metrics/route'

function req() {
  return new Request('http://t/api/admin/metrics')
}

describe('GET /api/admin/metrics', () => {
  beforeEach(() => {
    currentUser = { id: 'admin-1' }
    rpc.mockReset()
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
  })
})
