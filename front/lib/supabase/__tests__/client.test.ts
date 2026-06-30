import { describe, it, expect, vi } from 'vitest'

// createBrowserClient를 호출마다 새 객체 반환하도록 모킹 →
// 우리 createClient()가 동일 참조를 돌려주면 싱글톤(인스턴스 1개) 보장.
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({ id: Math.random() })),
}))

import { createBrowserClient } from '@supabase/ssr'
import { createClient } from '../client'

describe('브라우저 Supabase 클라이언트 싱글톤', () => {
  // 다중 GoTrueClient 인스턴스가 단일사용 refresh token 회전을 레이스로 무효화하는
  // 버그 방지: createClient()는 항상 동일 인스턴스를 반환해야 한다.
  it('여러 번 호출해도 같은 인스턴스 반환', () => {
    const a = createClient()
    const b = createClient()
    const c = createClient()
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(createBrowserClient).toHaveBeenCalledTimes(1)
  })
})
