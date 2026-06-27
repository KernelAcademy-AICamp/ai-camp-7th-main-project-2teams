import { describe, it, expect, vi, beforeEach } from 'vitest'

const exchangeCodeForSession = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession } }),
}))

import { GET } from '../callback/route'

describe('OAuth callback GET', () => {
  beforeEach(() => exchangeCodeForSession.mockReset())

  it('유효 code → next로 리다이렉트', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null })
    const res = await GET(new Request('http://t/auth/callback?code=abc'))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://t/')
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc')
  })

  it('code 없으면 /login?error=auth', async () => {
    const res = await GET(new Request('http://t/auth/callback'))

    expect(res.headers.get('location')).toBe('http://t/login?error=auth')
    expect(exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('교환 실패 → /login?error=auth', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error('bad') })
    const res = await GET(new Request('http://t/auth/callback?code=bad'))

    expect(res.headers.get('location')).toBe('http://t/login?error=auth')
  })
})
