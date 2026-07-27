import { describe, it, expect, beforeEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import {
  SEARCH_RESULTS_KEY,
  patchSearchResult,
  restoreSearchResults,
  type SearchResult,
} from '../useSearch'
import { applyFieldsToBookmark } from '../useUpdateBookmark'

// 검색 결과는 ['bookmarks'] 무한스크롤 캐시와 별도로 SearchResult[] 평면 배열로 보관된다.
// 북마크 mutation의 낙관적 업데이트가 이 캐시에도 반영되는지 검증.

const makeResult = (id: string, overrides: Partial<SearchResult> = {}): SearchResult => ({
  id,
  title: `북마크 ${id}`,
  url: 'https://example.com',
  tags: [],
  category_id: null,
  is_favorite: false,
  folder_hint: null,
  is_dead: false,
  created_at: '2026-01-01T00:00:00Z',
  similarity: 0.8,
  ...overrides,
})

describe('patchSearchResult', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  const seed = (results: SearchResult[]) => queryClient.setQueryData(SEARCH_RESULTS_KEY, results)
  const read = () => queryClient.getQueryData<SearchResult[]>(SEARCH_RESULTS_KEY)

  it('대상 id만 갱신 — 즐겨찾기 토글이 검색 결과에 반영', () => {
    seed([makeResult('1'), makeResult('2')])

    patchSearchResult(queryClient, '1', (b) => ({ ...b, is_favorite: true }))

    expect(read()?.[0].is_favorite).toBe(true)
    expect(read()?.[1].is_favorite).toBe(false) // 비대상: 불변
  })

  it('patch가 null 반환하면 목록에서 제거 — 삭제 반영', () => {
    seed([makeResult('1'), makeResult('2')])

    patchSearchResult(queryClient, '1', () => null)

    expect(read()).toHaveLength(1)
    expect(read()?.[0].id).toBe('2')
  })

  it('이전 스냅샷을 반환 — 실패 시 restoreSearchResults로 롤백', () => {
    seed([makeResult('1')])

    const previous = patchSearchResult(queryClient, '1', (b) => ({ ...b, is_favorite: true }))
    expect(read()?.[0].is_favorite).toBe(true)

    restoreSearchResults(queryClient, previous)

    expect(read()?.[0].is_favorite).toBe(false)
  })

  it('일치하는 id 없으면 목록 변화 없음', () => {
    seed([makeResult('1'), makeResult('2')])

    patchSearchResult(queryClient, 'nope', () => null)

    expect(read()).toHaveLength(2)
  })

  it('캐시가 비어 있으면(검색 미실행) 스냅샷 undefined, 크래시 없음', () => {
    const previous = patchSearchResult(queryClient, '1', (b) => ({ ...b, is_favorite: true }))

    expect(previous).toBeUndefined()
    expect(read()).toBeUndefined()
  })

  it('restoreSearchResults: undefined 스냅샷은 캐시를 건드리지 않음', () => {
    seed([makeResult('1', { is_favorite: true })])

    restoreSearchResults(queryClient, undefined)

    expect(read()?.[0].is_favorite).toBe(true)
  })

  it('applyFieldsToBookmark와 조합 — 태그·카테고리 수정이 검색 결과에 반영', () => {
    seed([makeResult('1', { tags: ['old'] })])

    patchSearchResult(queryClient, '1', (b) =>
      applyFieldsToBookmark(b, { tags: ['new'], category: '개발' }),
    )

    const patched = read()?.[0]
    expect(patched?.tags).toEqual(['new'])
    expect(patched?.category).toBe('개발')
    expect(patched?.similarity).toBe(0.8) // SearchResult 고유 필드 보존
  })
})
