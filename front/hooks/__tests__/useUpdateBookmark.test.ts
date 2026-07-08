import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, type InfiniteData } from '@tanstack/react-query'
import { fetchUpdateBookmark, applyOptimisticUpdate, isFilterMismatch } from '../useUpdateBookmark'
import type { Bookmark, BookmarksPage } from '../useBookmarks'

// useBookmarks가 useInfiniteQuery라 캐시는 InfiniteData<BookmarksPage> — 페이지 1개짜리로 시드.
const makeInfiniteData = (bookmarks: Bookmark[], total: number): InfiniteData<BookmarksPage> => ({
  pages: [{ bookmarks, total }],
  pageParams: [1],
})

const makeBookmark = (id: string, overrides: Partial<Bookmark> = {}): Bookmark => ({
  id,
  title: `북마크 ${id}`,
  url: 'https://example.com',
  description: null,
  tags: [],
  category_id: null,
  is_favorite: false,
  folder_hint: null,
  is_dead: false,
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

// --- (1) fetchUpdateBookmark 직접 검증 ---
describe('fetchUpdateBookmark', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('PATCH /api/bookmarks/:id 를 올바른 URL·body로 호출', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bookmark: makeBookmark('abc-123', { tags: ['개발'] }) }),
    })

    await fetchUpdateBookmark('abc-123', { tags: ['개발'] })

    expect(fetch).toHaveBeenCalledWith('/api/bookmarks/abc-123', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: ['개발'] }),
    })
  })

  it('category·description 동시 전달', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bookmark: makeBookmark('abc-123') }),
    })

    await fetchUpdateBookmark('abc-123', { category: '개발', description: '메모' })

    expect(fetch).toHaveBeenCalledWith(
      '/api/bookmarks/abc-123',
      expect.objectContaining({
        body: JSON.stringify({ category: '개발', description: '메모' }),
      })
    )
  })

  it('응답 실패(400) 시 에러 throw', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400 })

    await expect(fetchUpdateBookmark('abc-123', { tags: [] })).rejects.toThrow(
      'Update bookmark failed: 400'
    )
  })
})

// --- (2) applyOptimisticUpdate 순수 함수 검증 ---
describe('applyOptimisticUpdate', () => {
  it('tags 변경 즉시 반영', () => {
    const old = makeInfiniteData([makeBookmark('1', { tags: ['개발'] })], 1)

    const result = applyOptimisticUpdate(old, '1', { tags: ['디자인', 'UI/UX'] })

    expect(result?.pages[0].bookmarks[0].tags).toEqual(['디자인', 'UI/UX'])
  })

  it('description 변경 즉시 반영', () => {
    const old = makeInfiniteData([makeBookmark('1', { description: null })], 1)

    const result = applyOptimisticUpdate(old, '1', { description: '새 메모' })

    expect(result?.pages[0].bookmarks[0].description).toBe('새 메모')
  })

  it('category만 전달 시 category_id는 낙관적으로 변경하지 않음 (서버 upsert 결과 필요)', () => {
    const old = makeInfiniteData([makeBookmark('1', { category_id: null })], 1)

    const result = applyOptimisticUpdate(old, '1', { category: '개발' })

    expect(result?.pages[0].bookmarks[0].category_id).toBeNull()
  })

  it('존재하지 않는 id — 변경 없음', () => {
    const old = makeInfiniteData([makeBookmark('1')], 1)

    const result = applyOptimisticUpdate(old, 'does-not-exist', { tags: ['개발'] })

    expect(result?.pages[0].bookmarks[0].tags).toEqual([])
  })

  it('old가 undefined이면 undefined 반환 (캐시 미스 처리)', () => {
    expect(applyOptimisticUpdate(undefined, '1', { tags: [] })).toBeUndefined()
  })

  it('비대상 북마크 불변성 유지 — 값 보존', () => {
    const old = makeInfiniteData(
      [makeBookmark('1', { tags: ['개발'] }), makeBookmark('2', { tags: ['디자인'] })],
      2
    )

    const result = applyOptimisticUpdate(old, '1', { tags: ['금융'] })

    expect(result?.pages[0].bookmarks[1]).toEqual(makeBookmark('2', { tags: ['디자인'] }))
  })

  it('여러 페이지 중 대상이 있는 페이지에서만 반영', () => {
    const old: InfiniteData<BookmarksPage> = {
      pages: [
        { bookmarks: [makeBookmark('1', { tags: ['개발'] })], total: 2 },
        { bookmarks: [makeBookmark('2', { tags: ['디자인'] })], total: 2 },
      ],
      pageParams: [1, 2],
    }

    const result = applyOptimisticUpdate(old, '2', { tags: ['금융'] })

    expect(result?.pages[0].bookmarks[0].tags).toEqual(['개발'])
    expect(result?.pages[1].bookmarks[0].tags).toEqual(['금융'])
  })
})

// --- (2.5) isFilterMismatch 순수 함수 검증 ---
describe('isFilterMismatch', () => {
  it('filters가 undefined면 항상 false', () => {
    expect(isFilterMismatch(undefined, { category: '디자인' })).toBe(false)
  })

  it('category 필터와 변경값이 같으면(표준명) false', () => {
    const filters = { category: '개발' }
    expect(isFilterMismatch(filters, { category: '개발' })).toBe(false)
  })

  it('category 필터와 변경값이 alias로 같은 대분류를 가리키면 false', () => {
    const filters = { category: '개발' }
    // 'dev' → resolveTopCategory로 '개발' 표준화 — 필터와 일치
    expect(isFilterMismatch(filters, { category: 'dev' })).toBe(false)
  })

  it('category 필터와 변경값이 다르면 true (목록에서 제거 대상)', () => {
    const filters = { category: '개발' }
    expect(isFilterMismatch(filters, { category: '디자인' })).toBe(true)
  })

  it('category 필터가 있어도 category 변경이 없으면(다른 필드만 변경) false', () => {
    const filters = { category: '개발' }
    expect(isFilterMismatch(filters, { tags: ['a'] })).toBe(false)
  })

  it('category 필터 탭에서 미분류(null)로 변경하면 true (목록에서 제거 대상)', () => {
    const filters = { category: '개발' }
    expect(isFilterMismatch(filters, { category: null })).toBe(true)
  })

  it('tag 필터에 변경 후 태그가 여전히 포함되면 false', () => {
    const filters = { tag: 'Next.js' }
    expect(isFilterMismatch(filters, { tags: ['Next.js', '리액트'] })).toBe(false)
  })

  it('tag 필터에 변경 후 태그가 더 이상 없으면 true (목록에서 제거 대상)', () => {
    const filters = { tag: 'Next.js' }
    expect(isFilterMismatch(filters, { tags: ['리액트'] })).toBe(true)
  })

  it('tag 필터가 있어도 tags 변경이 없으면(다른 필드만 변경) false', () => {
    const filters = { tag: 'Next.js' }
    expect(isFilterMismatch(filters, { description: '메모' })).toBe(false)
  })
})

// --- (3) QueryClient 통합 검증: 낙관적 수정 + 롤백 ---
describe('낙관적 수정 + 롤백 통합 (QueryClient)', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  it('onMutate: 캐시에 tags 즉시 반영', () => {
    const filters = { tab: undefined }
    const queryKey = ['bookmarks', filters]
    queryClient.setQueryData(queryKey, makeInfiniteData([makeBookmark('1', { tags: [] })], 1))

    const previousData = queryClient.getQueriesData<InfiniteData<BookmarksPage>>({
      queryKey: ['bookmarks'],
    })

    for (const [key, data] of previousData) {
      if (!data) continue
      queryClient.setQueryData(key, applyOptimisticUpdate(data, '1', { tags: ['개발'] }) ?? data)
    }

    const cached = queryClient.getQueryData<InfiniteData<BookmarksPage>>(queryKey)
    expect(cached?.pages[0].bookmarks[0].tags).toEqual(['개발'])
  })

  it('onError: 스냅샷으로 캐시 복원 (롤백)', () => {
    const filters = { tab: undefined }
    const queryKey = ['bookmarks', filters]
    queryClient.setQueryData(queryKey, makeInfiniteData([makeBookmark('1', { tags: [] })], 1))

    const previousData = queryClient.getQueriesData<InfiniteData<BookmarksPage>>({
      queryKey: ['bookmarks'],
    })

    for (const [key, data] of previousData) {
      if (!data) continue
      queryClient.setQueryData(key, applyOptimisticUpdate(data, '1', { tags: ['개발'] }) ?? data)
    }

    expect(
      queryClient.getQueryData<InfiniteData<BookmarksPage>>(queryKey)?.pages[0].bookmarks[0].tags
    ).toEqual(['개발'])

    for (const [key, data] of previousData) {
      queryClient.setQueryData(key, data)
    }

    const restored = queryClient.getQueryData<InfiniteData<BookmarksPage>>(queryKey)
    expect(restored?.pages[0].bookmarks[0].tags).toEqual([])
  })

  it('[HIGH] 카테고리 필터 탭에서 다른 카테고리로 변경 → 목록에서 즉시 제거', () => {
    const filteredQueryKey = ['bookmarks', { category: '개발' }]
    queryClient.setQueryData(
      filteredQueryKey,
      makeInfiniteData(
        [makeBookmark('1', { category_id: 'dev-cat' }), makeBookmark('2', { category_id: 'dev-cat' })],
        2
      )
    )

    const previousData = queryClient.getQueriesData<InfiniteData<BookmarksPage>>({
      queryKey: ['bookmarks'],
    })

    // onMutate 로직 시뮬레이션 (실제 훅의 for-loop 패턴)
    const targetId = '1'
    const fields = { category: '디자인' }

    for (const [key, data] of previousData) {
      if (!data) continue
      const filters = key[1] as Record<string, string | undefined> | undefined

      let updated: InfiniteData<BookmarksPage>
      if (isFilterMismatch(filters, fields)) {
        updated = {
          ...data,
          pages: data.pages.map((page) => {
            const filtered = page.bookmarks.filter((b) => b.id !== targetId)
            const removed = page.bookmarks.length - filtered.length
            return { bookmarks: filtered, total: Math.max(0, page.total - removed) }
          }),
        }
      } else {
        updated = applyOptimisticUpdate(data, targetId, fields) ?? data
      }
      queryClient.setQueryData(key, updated)
    }

    const cached = queryClient.getQueryData<InfiniteData<BookmarksPage>>(filteredQueryKey)
    expect(cached?.pages[0].bookmarks).toHaveLength(1)
    expect(cached?.pages[0].bookmarks[0].id).toBe('2')
    expect(cached?.pages[0].total).toBe(1)
  })

  it('[HIGH] 태그 필터 탭에서 필터 태그를 제거 → 목록에서 즉시 제거', () => {
    const filteredQueryKey = ['bookmarks', { tag: 'Next.js' }]
    queryClient.setQueryData(
      filteredQueryKey,
      makeInfiniteData([makeBookmark('1', { tags: ['Next.js'] })], 1)
    )

    const previousData = queryClient.getQueriesData<InfiniteData<BookmarksPage>>({
      queryKey: ['bookmarks'],
    })

    const targetId = '1'
    const fields = { tags: ['리액트'] }

    for (const [key, data] of previousData) {
      if (!data) continue
      const filters = key[1] as Record<string, string | undefined> | undefined

      let updated: InfiniteData<BookmarksPage>
      if (isFilterMismatch(filters, fields)) {
        updated = {
          ...data,
          pages: data.pages.map((page) => {
            const filtered = page.bookmarks.filter((b) => b.id !== targetId)
            const removed = page.bookmarks.length - filtered.length
            return { bookmarks: filtered, total: Math.max(0, page.total - removed) }
          }),
        }
      } else {
        updated = applyOptimisticUpdate(data, targetId, fields) ?? data
      }
      queryClient.setQueryData(key, updated)
    }

    const cached = queryClient.getQueryData<InfiniteData<BookmarksPage>>(filteredQueryKey)
    expect(cached?.pages[0].bookmarks).toHaveLength(0)
    expect(cached?.pages[0].total).toBe(0)
  })
})
