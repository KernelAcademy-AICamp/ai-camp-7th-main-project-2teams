import { describe, it, expect, vi, beforeEach } from 'vitest'

// createClient 모킹 — 실제 Supabase/쿠키 접근 차단
const getUser = vi.fn()
vi.mock('../supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))

import { withAuth } from '../auth'

describe('withAuth', () => {
  beforeEach(() => getUser.mockReset())

  it('미인증이면 401', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    const handler = vi.fn()
    const res = await withAuth(handler)(new Request('http://t/api'))

    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it('인증되면 핸들러에 user·supabase 주입', async () => {
    const user = { id: 'u1', email: 'a@b.c' }
    getUser.mockResolvedValue({ data: { user }, error: null })
    const handler = vi.fn().mockResolvedValue(new Response('ok'))
    const res = await withAuth(handler)(new Request('http://t/api'))

    expect(res.status).toBe(200)
    const ctx = handler.mock.calls[0][1]
    expect(ctx.user).toEqual(user)
    expect(ctx.supabase).toBeDefined()
  })

  it('동적 라우트 context(params) 전달', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const handler = vi.fn().mockResolvedValue(new Response('ok'))
    await withAuth<{ params: Promise<{ id: string }> }>(handler)(
      new Request('http://t/api/x'),
      { params: Promise.resolve({ id: 'x' }) }
    )

    expect(await handler.mock.calls[0][1].params).toEqual({ id: 'x' })
  })
})
