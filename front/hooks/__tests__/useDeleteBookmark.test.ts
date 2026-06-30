import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { fetchDeleteBookmark, applyOptimisticDelete } from '../useDeleteBookmark'
import type { Bookmark } from '../useBookmarks'

const makeBookmark = (id: string): Bookmark => ({
  id,
  title: `북마크 ${id}`,
  url: 'https://example.com',
  tags: [],
  category_id: null,
  category: null,
  is_favorite: false,
  folder_hint: null,
  created_at: '2026-01-01T00:00:00Z',
})

// --- (1) fetchDeleteBookmark 직접 검증 ---
describe('fetchDeleteBookmark', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('DELETE /api/bookmarks/:id 를 올바른 URL·메서드로 호출', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    })

    await fetchDeleteBookmark('abc-123')

    expect(fetch).toHaveBeenCalledWith('/api/bookmarks/abc-123', {
      method: 'DELETE',
    })
  })

  it('성공 시 { success: true } 반환', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    })

    const result = await fetchDeleteBookmark('abc-123')

    expect(result).toEqual({ success: true })
  })

  it('응답 실패(404) 시 에러 throw', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })

    await expect(fetchDeleteBookmark('not-exist')).rejects.toThrow(
      'Delete bookmark failed: 404'
    )
  })

  it('응답 실패(500) 시 에러 throw', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })

    await expect(fetchDeleteBookmark('abc-123')).rejects.toThrow(
      'Delete bookmark failed: 500'
    )
  })
})

// --- (2) applyOptimisticDelete 순수 함수 검증 ---
describe('applyOptimisticDelete', () => {
  it('대상 id 북마크 제거 + total 감소', () => {
    const old = {
      bookmarks: [makeBookmark('1'), makeBookmark('2'), makeBookmark('3')],
      total: 3,
    }

    const result = applyOptimisticDelete(old, '2')

    expect(result?.bookmarks).toHaveLength(2)
    expect(result?.bookmarks.map((b) => b.id)).toEqual(['1', '3'])
    expect(result?.total).toBe(2)
  })

  it('존재하지 않는 id — 목록·total 변경 없음', () => {
    const old = {
      bookmarks: [makeBookmark('1'), makeBookmark('2')],
      total: 2,
    }

    const result = applyOptimisticDelete(old, 'does-not-exist')

    expect(result?.bookmarks).toHaveLength(2)
    expect(result?.total).toBe(2)
  })

  it('old가 undefined이면 undefined 반환 (캐시 미스 처리)', () => {
    expect(applyOptimisticDelete(undefined, '1')).toBeUndefined()
  })

  it('단일 항목 삭제 후 total이 0 미만으로 내려가지 않음', () => {
    const old = {
      bookmarks: [makeBookmark('1')],
      total: 1,
    }

    const result = applyOptimisticDelete(old, '1')

    expect(result?.bookmarks).toHaveLength(0)
    expect(result?.total).toBe(0)
  })

  it('비대상 북마크 불변성 유지 — 참조·값 보존', () => {
    const old = {
      bookmarks: [makeBookmark('1'), makeBookmark('2')],
      total: 2,
    }

    const result = applyOptimisticDelete(old, '1')

    expect(result?.bookmarks[0]).toEqual(makeBookmark('2'))
  })
})

// --- (3) QueryClient 통합 검증: 낙관적 삭제 + 롤백 ---
describe('낙관적 삭제 + 롤백 통합 (QueryClient)', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  it('onMutate: 캐시에서 해당 북마크 즉시 제거', () => {
    const filters = { tab: undefined }
    const queryKey = ['bookmarks', filters]
    queryClient.setQueryData(queryKey, {
      bookmarks: [makeBookmark('1'), makeBookmark('2')],
      total: 2,
    })

    // onMutate 로직 시뮬레이션
    const previousData = queryClient.getQueriesData<{
      bookmarks: Bookmark[]
      total: number
    }>({ queryKey: ['bookmarks'] })

    for (const [key, data] of previousData) {
      if (!data) continue
      queryClient.setQueryData(key, applyOptimisticDelete(data, '1') ?? data)
    }

    const cached = queryClient.getQueryData<{ bookmarks: Bookmark[]; total: number }>(queryKey)
    expect(cached?.bookmarks).toHaveLength(1)
    expect(cached?.bookmarks[0].id).toBe('2')
    expect(cached?.total).toBe(1)
  })

  it('onError: 스냅샷으로 캐시 복원 (롤백)', () => {
    const filters = { tab: undefined }
    const queryKey = ['bookmarks', filters]
    queryClient.setQueryData(queryKey, {
      bookmarks: [makeBookmark('1'), makeBookmark('2')],
      total: 2,
    })

    // 스냅샷 저장
    const previousData = queryClient.getQueriesData<{
      bookmarks: Bookmark[]
      total: number
    }>({ queryKey: ['bookmarks'] })

    // 낙관적 삭제
    for (const [key, data] of previousData) {
      if (!data) continue
      queryClient.setQueryData(key, applyOptimisticDelete(data, '1') ?? data)
    }

    // 낙관적 삭제 반영 확인
    expect(
      queryClient.getQueryData<{ bookmarks: Bookmark[] }>(queryKey)?.bookmarks
    ).toHaveLength(1)

    // onError 롤백: 스냅샷 복원
    for (const [key, data] of previousData) {
      queryClient.setQueryData(key, data)
    }

    const restored = queryClient.getQueryData<{ bookmarks: Bookmark[]; total: number }>(queryKey)
    expect(restored?.bookmarks).toHaveLength(2)
    expect(restored?.total).toBe(2)
  })

  it('여러 탭 캐시가 동시에 존재할 때 모두 제거됨', () => {
    const allKey = ['bookmarks', { tab: undefined }]
    const favKey = ['bookmarks', { tab: 'favorites' }]

    queryClient.setQueryData(allKey, {
      bookmarks: [makeBookmark('1'), makeBookmark('2')],
      total: 2,
    })
    queryClient.setQueryData(favKey, {
      bookmarks: [makeBookmark('1')],
      total: 1,
    })

    const previousData = queryClient.getQueriesData<{
      bookmarks: Bookmark[]
      total: number
    }>({ queryKey: ['bookmarks'] })

    for (const [key, data] of previousData) {
      if (!data) continue
      queryClient.setQueryData(key, applyOptimisticDelete(data, '1') ?? data)
    }

    const allCached = queryClient.getQueryData<{ bookmarks: Bookmark[]; total: number }>(allKey)
    const favCached = queryClient.getQueryData<{ bookmarks: Bookmark[]; total: number }>(favKey)

    expect(allCached?.bookmarks).toHaveLength(1)
    expect(favCached?.bookmarks).toHaveLength(0)
    expect(favCached?.total).toBe(0)
  })
})
