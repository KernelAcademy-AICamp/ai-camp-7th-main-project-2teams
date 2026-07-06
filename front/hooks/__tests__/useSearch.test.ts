import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchSearch } from '../useSearch'

describe('fetchSearch', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('POST /api/search 호출', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    })
    const data = await fetchSearch({ query: '리액트' })
    expect(fetch).toHaveBeenCalledWith('/api/search', expect.objectContaining({ method: 'POST' }))
    expect(data).toEqual({ results: [] })
  })

  it('500 응답 → 에러 throw', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    await expect(fetchSearch({ query: 'test' })).rejects.toThrow('Search failed: 500')
  })

  it('빈 results 처리', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    })
    const data = await fetchSearch({ query: '존재하지않는검색어' })
    expect(data.results).toHaveLength(0)
  })
})

// A58: 태그/즐겨찾기 필터가 fetch body에 그대로 전달되는지 검증 (실제 fetchSearch 구현 대상).
describe('fetchSearch — tag/is_favorite 필터 (A58)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('tag 지정 시 fetch body에 tag 포함', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) })
    await fetchSearch({ query: '리액트', tag: '프론트엔드' })
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/search',
      expect.objectContaining({
        body: JSON.stringify({ query: '리액트', category: undefined, tag: '프론트엔드', is_favorite: undefined }),
      }),
    )
  })

  it('is_favorite: true 지정 시 fetch body에 is_favorite 포함', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) })
    await fetchSearch({ query: '리액트', is_favorite: true })
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/search',
      expect.objectContaining({
        body: JSON.stringify({ query: '리액트', category: undefined, tag: undefined, is_favorite: true }),
      }),
    )
  })

  it('tag + is_favorite 복합 필터 동시 전달 ("즐겨찾기 중 리액트" 케이스)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) })
    await fetchSearch({ query: '리액트', tag: '프론트엔드', is_favorite: true })
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/search',
      expect.objectContaining({
        body: JSON.stringify({ query: '리액트', category: undefined, tag: '프론트엔드', is_favorite: true }),
      }),
    )
  })

  it('tag/is_favorite 미지정 시 undefined 전달 (기존 동작 회귀 방지)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) })
    await fetchSearch({ query: '리액트' })
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/search',
      expect.objectContaining({
        body: JSON.stringify({ query: '리액트', category: undefined, tag: undefined, is_favorite: undefined }),
      }),
    )
  })
})
