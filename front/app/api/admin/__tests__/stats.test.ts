import { describe, it, expect, vi, beforeEach } from 'vitest'

let currentUser: unknown = { id: 'admin-1' }
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser }, error: null }) },
  }),
}))

const rpc = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc }),
}))

import { GET } from '../stats/route'

function req(qs = '') {
  return new Request(`http://t/api/admin/stats${qs}`)
}

describe('GET /api/admin/stats', () => {
  beforeEach(() => {
    process.env.ADMIN_USER_IDS = 'admin-1'
    currentUser = { id: 'admin-1' }
    rpc.mockReset()
  })

  it('비관리자는 404', async () => {
    currentUser = { id: 'stranger' }
    const res = await GET(req())
    expect(res.status).toBe(404)
  })

  it('OKR + 카테고리 % 집계 반환', async () => {
    rpc.mockImplementation((fn: string) => {
      if (fn === 'admin_okr_stats')
        return Promise.resolve({
          data: [{ active_users: 10, first_save_rate: 0.6, saves_per_user: 3, new_saves: 30 }],
          error: null,
        })
      if (fn === 'admin_category_stats')
        return Promise.resolve({
          data: [
            { name: '개발', count: 30 },
            { name: '미분류', count: 10 },
          ],
          error: null,
        })
      return Promise.resolve({ data: [], error: null })
    })

    const res = await GET(req('?range=7d'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.range).toBe('7d')
    expect(body.okr.activeUsers).toBe(10)
    expect(body.categories[0]).toEqual({ name: '개발', count: 30, pct: 0.75 })
    // 금지 컬럼 부재
    expect(JSON.stringify(body)).not.toContain('embedding')
    expect(JSON.stringify(body)).not.toContain('user_id')
  })

  it('category 지정 시 태그 드릴다운 반환', async () => {
    rpc.mockResolvedValue({
      data: [
        { tag: 'React', count: 6 },
        { tag: 'Next.js', count: 4 },
      ],
      error: null,
    })

    const res = await GET(req('?range=7d&category=개발'))
    const body = await res.json()

    expect(rpc).toHaveBeenCalledWith('admin_tag_stats', { p_category: '개발', p_interval: '7 days' })
    expect(body.category).toBe('개발')
    expect(body.tags[0]).toEqual({ tag: 'React', count: 6, pct: 0.6 })
  })

  it('RPC 에러 시 500', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await GET(req('?range=7d'))
    expect(res.status).toBe(500)
  })
})
