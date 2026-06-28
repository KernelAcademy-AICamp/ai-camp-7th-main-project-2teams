import { describe, it, expect, vi, beforeEach } from 'vitest'

// createServerClient 호출 인자 캡처 — Bearer 헤더가 global에 주입되는지 검증
type ClientOpts = { global?: { headers?: Record<string, string> } }
const { createServerClient } = vi.hoisted(() => ({
  // 인자 타입 명시 — calls[0][2](options)에 안전 접근
  createServerClient: vi.fn(
    (_url: string, _key: string, _opts: { global?: { headers?: Record<string, string> } }) => ({}),
  ),
}))
vi.mock('@supabase/ssr', () => ({ createServerClient }))

let authHeader: string | null = null
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
  headers: async () => ({ get: () => authHeader }),
}))

import { createClient } from '../server'

describe('createClient', () => {
  beforeEach(() => {
    createServerClient.mockClear()
    authHeader = null
  })

  it('Authorization 헤더 있으면 global.headers에 주입 (익스텐션 인증)', async () => {
    authHeader = 'Bearer token-abc'
    await createClient()
    const opts = createServerClient.mock.calls[0][2] as ClientOpts
    expect(opts.global?.headers?.Authorization).toBe('Bearer token-abc')
  })

  it('헤더 없으면 global 미설정 (웹앱 쿠키 경로)', async () => {
    await createClient()
    const opts = createServerClient.mock.calls[0][2] as ClientOpts
    expect(opts.global).toBeUndefined()
  })
})
