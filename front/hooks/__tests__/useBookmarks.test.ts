// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement, type ReactNode } from 'react'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useBookmarks, type Bookmark } from '../useBookmarks'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

const makeBookmarks = (count: number, offset = 0): Bookmark[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `bm-${offset + i}`,
    title: `북마크 ${offset + i}`,
    url: 'https://example.com',
    tags: [],
    category_id: null,
    is_favorite: false,
    folder_hint: null,
    is_dead: false,
    created_at: '2026-01-01T00:00:00Z',
  }))

describe('useBookmarks — 서버 페이지네이션 (A62)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('필터 없이 첫 페이지 요청 시 page=1&limit=20 파라미터 포함', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bookmarks: makeBookmarks(20), total: 20 }),
    })

    const { result } = renderHook(() => useBookmarks({}), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetch).toHaveBeenCalledWith('/api/bookmarks?page=1&limit=20')
  })

  it('tab=favorites 필터와 함께 page/limit 파라미터 전달', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bookmarks: [], total: 0 }),
    })

    const { result } = renderHook(() => useBookmarks({ tab: 'favorites' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetch).toHaveBeenCalledWith('/api/bookmarks?tab=favorites&page=1&limit=20')
  })

  it('null/undefined 필터 값은 URL 파라미터에서 제외', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bookmarks: [], total: 0 }),
    })

    const { result } = renderHook(
      () => useBookmarks({ category: 'tech', folder: undefined }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetch).toHaveBeenCalledWith('/api/bookmarks?category=tech&page=1&limit=20')
  })

  it('로드된 개수가 total보다 적으면 hasNextPage: true', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bookmarks: makeBookmarks(20), total: 45 }),
    })

    const { result } = renderHook(() => useBookmarks({}), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.hasNextPage).toBe(true)
  })

  it('fetchNextPage 호출 시 page=2로 재요청하고 누적 bookmarks를 반환', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ bookmarks: makeBookmarks(20, 0), total: 45 }),
    })

    const { result } = renderHook(() => useBookmarks({}), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ bookmarks: makeBookmarks(20, 20), total: 45 }),
    })

    act(() => {
      result.current.fetchNextPage()
    })

    await waitFor(() => expect(result.current.data?.pages.length).toBe(2))

    expect(fetch).toHaveBeenCalledWith('/api/bookmarks?page=2&limit=20')
    const allBookmarks = result.current.data!.pages.flatMap((p) => p.bookmarks)
    expect(allBookmarks).toHaveLength(40)
    expect(result.current.hasNextPage).toBe(true)
  })

  it('누적 개수가 total에 도달하면 getNextPageParam이 undefined를 반환 (hasNextPage: false)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ bookmarks: makeBookmarks(20, 0), total: 45 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ bookmarks: makeBookmarks(20, 20), total: 45 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ bookmarks: makeBookmarks(5, 40), total: 45 }) })
    global.fetch = fetchMock

    const { result } = renderHook(() => useBookmarks({}), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    act(() => {
      result.current.fetchNextPage()
    })
    await waitFor(() => expect(result.current.data?.pages.length).toBe(2))
    expect(result.current.hasNextPage).toBe(true)

    act(() => {
      result.current.fetchNextPage()
    })
    await waitFor(() => expect(result.current.data?.pages.length).toBe(3))

    expect(result.current.hasNextPage).toBe(false)
    const allBookmarks = result.current.data!.pages.flatMap((p) => p.bookmarks)
    expect(allBookmarks).toHaveLength(45)
  })

  it('fetch 실패 시 isError: true', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })

    const { result } = renderHook(() => useBookmarks({}), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
