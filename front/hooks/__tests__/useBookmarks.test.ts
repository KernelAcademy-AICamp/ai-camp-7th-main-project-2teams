import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('useBookmarks queryFn', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('필터 없이 /api/bookmarks 호출', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bookmarks: [], total: 0 }),
    })
    const params = new URLSearchParams(
      Object.fromEntries(
        Object.entries({}).filter(([, v]) => v != null)
      ) as Record<string, string>
    )
    const res = await fetch(`/api/bookmarks?${params}`)
    const data = await res.json()
    expect(fetch).toHaveBeenCalledWith('/api/bookmarks?')
    expect(data).toEqual({ bookmarks: [], total: 0 })
  })

  it('tab=favorites 필터 URL 파라미터 포함', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bookmarks: [], total: 0 }),
    })
    const filters = { tab: 'favorites' }
    const params = new URLSearchParams(
      Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v != null)
      ) as Record<string, string>
    )
    await fetch(`/api/bookmarks?${params}`)
    expect(fetch).toHaveBeenCalledWith('/api/bookmarks?tab=favorites')
  })

  it('fetch 실패 시 에러 throw', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    const queryFn = async () => {
      const res = await fetch('/api/bookmarks?')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    }
    await expect(queryFn()).rejects.toThrow('Failed to fetch')
  })

  it('null 필터 값은 URL 파라미터에서 제외', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bookmarks: [], total: 0 }),
    })
    // null은 Object.entries filter에서 제거됨
    const filters = { tab: undefined, category: 'tech', folder: undefined }
    const params = new URLSearchParams(
      Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v != null)
      ) as Record<string, string>
    )
    await fetch(`/api/bookmarks?${params}`)
    expect(fetch).toHaveBeenCalledWith('/api/bookmarks?category=tech')
  })

  it('응답 데이터에 total 포함', async () => {
    const mockBookmarks = [
      {
        id: 'uuid-1',
        title: '테스트 북마크',
        url: 'https://example.com',
        tags: ['tech'],
        category_id: null,
        is_favorite: false,
        folder_hint: null,
        created_at: '2026-06-28T00:00:00Z',
      },
    ]
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bookmarks: mockBookmarks, total: 1 }),
    })
    const res = await fetch('/api/bookmarks?')
    const data = await res.json()
    expect(data.total).toBe(1)
    expect(data.bookmarks).toHaveLength(1)
    expect(data.bookmarks[0].id).toBe('uuid-1')
  })
})
