import { describe, it, expect, vi, beforeEach } from 'vitest'

// signOutAndPurge 핵심 로직 단위 테스트 (background/index.js에서 추출, A24)
function makeSignOutAndPurge({ supabase, chromeMock }) {
  return async function signOutAndPurge() {
    await supabase.auth.signOut().catch(() => {})
    await chromeMock.storage.local.clear()
  }
}

describe('signOutAndPurge', () => {
  let supabase, chromeMock, store

  beforeEach(() => {
    store = { 'sb-session': 'tok', 'sb-cache': 'x' }
    supabase = { auth: { signOut: vi.fn().mockResolvedValue({}) } }
    chromeMock = {
      storage: {
        local: {
          clear: vi.fn(() => { Object.keys(store).forEach((k) => delete store[k]); return Promise.resolve() }),
        },
      },
    }
  })

  it('signOut 호출 + storage 전체 삭제 (키 0개)', async () => {
    const purge = makeSignOutAndPurge({ supabase, chromeMock })
    await purge()
    expect(supabase.auth.signOut).toHaveBeenCalled()
    expect(chromeMock.storage.local.clear).toHaveBeenCalled()
    expect(Object.keys(store)).toHaveLength(0)
  })

  it('signOut 실패해도 storage는 삭제 (이중 방어)', async () => {
    supabase.auth.signOut.mockRejectedValue(new Error('no session'))
    const purge = makeSignOutAndPurge({ supabase, chromeMock })
    await purge()
    expect(chromeMock.storage.local.clear).toHaveBeenCalled()
    expect(Object.keys(store)).toHaveLength(0)
  })
})
