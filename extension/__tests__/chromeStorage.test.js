import { describe, it, expect, vi, beforeEach } from 'vitest'

// chrome.storage.local 모킹
const store = {}
const chromeMock = {
  storage: {
    local: {
      get: vi.fn((key, cb) => cb({ [key]: store[key] })),
      set: vi.fn((obj, cb) => { Object.assign(store, obj); cb?.() }),
      remove: vi.fn((key, cb) => { delete store[key]; cb?.() }),
    },
  },
}
globalThis.chrome = chromeMock

// 모킹 후 import (chrome 전역 필요)
const { chromeStorage } = await import('../lib/supabase.js')

describe('chromeStorage 어댑터', () => {
  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k])
    vi.clearAllMocks()
    chromeMock.storage.local.get.mockImplementation((key, cb) => cb({ [key]: store[key] }))
    chromeMock.storage.local.set.mockImplementation((obj, cb) => { Object.assign(store, obj); cb?.() })
    chromeMock.storage.local.remove.mockImplementation((key, cb) => { delete store[key]; cb?.() })
  })

  it('setItem → getItem 라운드트립', async () => {
    await chromeStorage.setItem('session', 'abc')
    const val = await chromeStorage.getItem('session')
    expect(val).toBe('abc')
  })

  it('없는 키 → null 반환', async () => {
    const val = await chromeStorage.getItem('nonexistent')
    expect(val).toBeNull()
  })

  it('removeItem 후 null 반환', async () => {
    await chromeStorage.setItem('token', 'xyz')
    await chromeStorage.removeItem('token')
    const val = await chromeStorage.getItem('token')
    expect(val).toBeNull()
  })
})
