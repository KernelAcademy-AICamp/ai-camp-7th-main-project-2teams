import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, type InfiniteData } from '@tanstack/react-query'
import { fetchToggleFavorite, applyOptimisticToggle } from '../useToggleFavorite'
import type { Bookmark, BookmarksPage } from '../useBookmarks'

// useBookmarks가 useInfiniteQuery라 캐시는 InfiniteData<BookmarksPage> — 페이지 1개짜리로 시드.
const makeInfiniteData = (bookmarks: Bookmark[], total: number): InfiniteData<BookmarksPage> => ({
  pages: [{ bookmarks, total }],
  pageParams: [1],
})

const makeBookmark = (id: string, is_favorite: boolean): Bookmark => ({
  id,
  title: `북마크 ${id}`,
  url: 'https://example.com',
  tags: [],
  category_id: null,
  is_favorite,
  folder_hint: null,
  is_dead: false,
  created_at: '2026-01-01T00:00:00Z',
})

// --- (1) fetchToggleFavorite 직접 검증 ---
describe('fetchToggleFavorite', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('PATCH /api/bookmarks/:id 를 올바른 URL·body로 호출', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bookmark: makeBookmark('abc-123', true) }),
    })

    await fetchToggleFavorite('abc-123', true)

    expect(fetch).toHaveBeenCalledWith('/api/bookmarks/abc-123', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_favorite: true }),
    })
  })

  it('is_favorite:false 전송 — 해제 방향 처리', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bookmark: makeBookmark('xyz-456', false) }),
    })

    const result = await fetchToggleFavorite('xyz-456', false)

    expect(fetch).toHaveBeenCalledWith(
      '/api/bookmarks/xyz-456',
      expect.objectContaining({ body: JSON.stringify({ is_favorite: false }) })
    )
    expect(result.bookmark.is_favorite).toBe(false)
  })

  it('응답 실패(500) 시 에러 throw', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })

    await expect(fetchToggleFavorite('123', true)).rejects.toThrow(
      'Toggle favorite failed: 500'
    )
  })
})

// --- (2) applyOptimisticToggle 순수 함수 검증 ---
describe('applyOptimisticToggle', () => {
  it('대상 북마크의 is_favorite 토글 — false → true', () => {
    const old = makeInfiniteData([makeBookmark('1', false), makeBookmark('2', true)], 2)

    const result = applyOptimisticToggle(old, '1', true)

    expect(result?.pages[0].bookmarks[0].is_favorite).toBe(true)
    expect(result?.pages[0].bookmarks[1].is_favorite).toBe(true) // 비대상: 불변
  })

  it('대상 북마크의 is_favorite 토글 — true → false', () => {
    const old = makeInfiniteData([makeBookmark('1', true), makeBookmark('2', false)], 2)

    const result = applyOptimisticToggle(old, '1', false)

    expect(result?.pages[0].bookmarks[0].is_favorite).toBe(false)
    expect(result?.pages[0].bookmarks[1].is_favorite).toBe(false) // 비대상: 불변
  })

  it('old가 undefined이면 undefined 반환 (캐시 미스 처리)', () => {
    expect(applyOptimisticToggle(undefined, '1', true)).toBeUndefined()
  })

  it('id와 일치하지 않는 북마크는 변경 없음', () => {
    const old = makeInfiniteData([makeBookmark('1', false), makeBookmark('2', false)], 2)

    const result = applyOptimisticToggle(old, '1', true)

    expect(result?.pages[0].bookmarks[1].id).toBe('2')
    expect(result?.pages[0].bookmarks[1].is_favorite).toBe(false)
  })

  it('여러 페이지에 걸쳐 있어도 대상 페이지만 토글', () => {
    const old: InfiniteData<BookmarksPage> = {
      pages: [
        { bookmarks: [makeBookmark('1', false)], total: 2 },
        { bookmarks: [makeBookmark('2', false)], total: 2 },
      ],
      pageParams: [1, 2],
    }

    const result = applyOptimisticToggle(old, '2', true)

    expect(result?.pages[0].bookmarks[0].is_favorite).toBe(false)
    expect(result?.pages[1].bookmarks[0].is_favorite).toBe(true)
  })
})

// --- (3) QueryClient 통합 검증: 낙관적 업데이트 + 롤백 ---
describe('낙관적 업데이트 + 롤백 통합 (QueryClient)', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  it('onMutate: 일반 탭에서 캐시 is_favorite 업데이트', () => {
    const filters = { tab: undefined, category: undefined }
    const queryKey = ['bookmarks', filters]
    queryClient.setQueryData(queryKey, makeInfiniteData([makeBookmark('1', false)], 1))

    // onMutate 로직 시뮬레이션 (실제 훅의 for-loop 패턴)
    const previousData = queryClient.getQueriesData<InfiniteData<BookmarksPage>>({
      queryKey: ['bookmarks'],
    })

    for (const [key, data] of previousData) {
      if (!data) continue
      queryClient.setQueryData(key, applyOptimisticToggle(data, '1', true) ?? data)
    }

    const cached = queryClient.getQueryData<InfiniteData<BookmarksPage>>(queryKey)
    expect(cached?.pages[0].bookmarks[0].is_favorite).toBe(true)
  })

  it('onError: 스냅샷으로 캐시 복원 (롤백)', () => {
    const filters = { tab: undefined }
    const queryKey = ['bookmarks', filters]
    queryClient.setQueryData(queryKey, makeInfiniteData([makeBookmark('1', false)], 1))

    // 스냅샷 저장
    const previousData = queryClient.getQueriesData<InfiniteData<BookmarksPage>>({
      queryKey: ['bookmarks'],
    })

    // 낙관적 업데이트
    for (const [key, data] of previousData) {
      if (!data) continue
      queryClient.setQueryData(key, applyOptimisticToggle(data, '1', true) ?? data)
    }

    // 낙관적 업데이트 반영 확인
    expect(
      queryClient.getQueryData<InfiniteData<BookmarksPage>>(queryKey)?.pages[0].bookmarks[0]
        .is_favorite
    ).toBe(true)

    // onError 롤백: 스냅샷 복원
    for (const [key, data] of previousData) {
      queryClient.setQueryData(key, data)
    }

    const restored = queryClient.getQueryData<InfiniteData<BookmarksPage>>(queryKey)
    expect(restored?.pages[0].bookmarks[0].is_favorite).toBe(false)
  })

  it('[H-2] 즐겨찾기 탭에서 is_favorite:false → 아이템 즉시 제거', () => {
    const favQueryKey = ['bookmarks', { tab: 'favorites' }]
    queryClient.setQueryData(
      favQueryKey,
      makeInfiniteData([makeBookmark('1', true), makeBookmark('2', true)], 2)
    )

    const previousData = queryClient.getQueriesData<InfiniteData<BookmarksPage>>({
      queryKey: ['bookmarks'],
    })

    // onMutate H-2 분기 시뮬레이션 (즐겨찾기 해제: is_favorite → false)
    const targetId = '1'
    const newIsFavorite = false

    for (const [key, data] of previousData) {
      if (!data) continue
      const filters = key[1] as Record<string, string | undefined> | undefined
      const isInFavoritesTab = filters?.tab === 'favorites'

      let updated: InfiniteData<BookmarksPage>
      if (isInFavoritesTab && !newIsFavorite) {
        // 즐겨찾기 탭에서 해제 → 모든 페이지에서 제거
        updated = {
          ...data,
          pages: data.pages.map((page) => {
            const filtered = page.bookmarks.filter((b) => b.id !== targetId)
            const removed = page.bookmarks.length - filtered.length
            return { bookmarks: filtered, total: Math.max(0, page.total - removed) }
          }),
        }
      } else {
        updated = applyOptimisticToggle(data, targetId, newIsFavorite) ?? data
      }
      queryClient.setQueryData(key, updated)
    }

    const cached = queryClient.getQueryData<InfiniteData<BookmarksPage>>(favQueryKey)
    expect(cached?.pages[0].bookmarks).toHaveLength(1)
    expect(cached?.pages[0].bookmarks[0].id).toBe('2')
    expect(cached?.pages[0].total).toBe(1)
  })
})
