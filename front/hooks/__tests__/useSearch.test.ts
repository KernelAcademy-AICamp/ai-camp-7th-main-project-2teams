// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement, type ReactNode } from 'react'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fetchSearch, useSearch, type SearchResult } from '../useSearch'

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

// A62: 검색은 top-60을 한 번에 받은 뒤 클라이언트에서만 슬라이스 — 추가 네트워크 호출 없음.
describe('useSearch — visibleCount/showMore/hasMore (A62)', () => {
  function createWrapper() {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    return function Wrapper({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client: queryClient }, children)
    }
  }

  const makeResults = (count: number): SearchResult[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `bm-${i}`,
      title: `북마크 ${i}`,
      url: 'https://example.com',
      tags: [],
      category_id: null,
      is_favorite: false,
      folder_hint: null,
      created_at: '2026-01-01T00:00:00Z',
      similarity: 0.9,
    }))

  beforeEach(() => vi.restoreAllMocks())

  it('결과가 20개 이하면 visibleResults에 전체 노출, hasMore: false', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: makeResults(10) }) })
    const { result } = renderHook(() => useSearch(), { wrapper: createWrapper() })

    act(() => {
      result.current.mutate({ query: '리액트' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.visibleResults).toHaveLength(10)
    expect(result.current.hasMore).toBe(false)
  })

  it('결과가 20개 초과면 초기 visibleResults는 20개로 슬라이스, hasMore: true', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: makeResults(60) }) })
    const { result } = renderHook(() => useSearch(), { wrapper: createWrapper() })

    act(() => {
      result.current.mutate({ query: '리액트' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.visibleResults).toHaveLength(20)
    expect(result.current.hasMore).toBe(true)
  })

  it('showMore 호출 시 visibleCount가 20씩 증가', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: makeResults(60) }) })
    const { result } = renderHook(() => useSearch(), { wrapper: createWrapper() })

    act(() => {
      result.current.mutate({ query: '리액트' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    act(() => {
      result.current.showMore()
    })
    await waitFor(() => expect(result.current.visibleResults).toHaveLength(40))

    act(() => {
      result.current.showMore()
    })
    await waitFor(() => expect(result.current.visibleResults).toHaveLength(60))
    expect(result.current.hasMore).toBe(false)
  })

  it('빈 결과 → visibleResults 빈 배열, hasMore: false', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) })
    const { result } = renderHook(() => useSearch(), { wrapper: createWrapper() })

    act(() => {
      result.current.mutate({ query: '존재하지않음' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.visibleResults).toEqual([])
    expect(result.current.hasMore).toBe(false)
  })

  it('새 검색 실행 시 visibleCount가 초기값(20)으로 리셋', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: makeResults(60) }) })
    const { result } = renderHook(() => useSearch(), { wrapper: createWrapper() })

    act(() => {
      result.current.mutate({ query: '리액트' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    act(() => {
      result.current.showMore()
    })
    await waitFor(() => expect(result.current.visibleResults).toHaveLength(40))

    // 새 검색 실행 (다른 결과셋) — 이전 검색의 스크롤 진행이 남지 않아야 함
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: makeResults(15) }) })
    act(() => {
      result.current.mutate({ query: '뷰' })
    })
    await waitFor(() => expect(result.current.data?.results).toHaveLength(15))

    expect(result.current.visibleResults).toHaveLength(15)
    expect(result.current.hasMore).toBe(false)
  })
})
