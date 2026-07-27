import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import type { Bookmark } from './useBookmarks'

/**
 * 검색 결과 보관 캐시 키.
 * mutation.data는 훅 로컬 상태라 외부(즐겨찾기 토글 등)에서 갱신할 수 없어 UI가 stale해진다.
 * 결과를 쿼리 캐시에 미러링해 낙관적 업데이트 대상으로 만든다.
 */
export const SEARCH_RESULTS_KEY = ['search-results'] as const

export interface SearchResult extends Bookmark {
  similarity: number
  /** 벡터+trgm RRF 병합 점수 — 서버 정렬 기준 (0025 이전 RPC는 미반환) */
  rrf_score?: number
}

interface SearchParams {
  query: string
  category?: string
  // A58: 사이드바 태그/즐겨찾기 필터를 검색에도 그대로 전달 — 미지정 시 기존 전체 검색과 동일.
  tag?: string
  is_favorite?: boolean
}

// fetchDeleteBookmark(useDeleteBookmark.ts)와 동일 패턴 — 훅과 분리해 순수 함수로 단위 테스트 가능.
export async function fetchSearch({
  query,
  category,
  tag,
  is_favorite,
}: SearchParams): Promise<{ results: SearchResult[] }> {
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, category, tag, is_favorite }),
  })
  if (!res.ok) throw new Error(`Search failed: ${res.status}`)
  return res.json()
}

// A62: 검색은 요청마다 OpenAI 임베딩 호출이 발생해 목록처럼 스크롤마다 서버 재호출하면
// 비용·레이턴시가 커진다. 서버가 한 번에 top-60을 반환(match_count, app/api/search/route.ts)하면
// 이후 스크롤은 이미 받은 배열 안에서 노출 개수만 늘린다 — 추가 네트워크 호출 없음.
const SEARCH_PAGE_SIZE = 20

/**
 * 검색 결과 캐시에서 id 항목만 갱신(patch 반환값)하거나 제거(null 반환).
 * 북마크 mutation들이 ['bookmarks'] 캐시를 낙관적으로 고칠 때 검색 화면도 같이 반영시키기 위한 진입점.
 * @returns 롤백용 이전 스냅샷 (캐시 미존재 시 undefined)
 */
export function patchSearchResult(
  queryClient: QueryClient,
  id: string,
  patch: (bookmark: SearchResult) => SearchResult | null
): SearchResult[] | undefined {
  const previous = queryClient.getQueryData<SearchResult[]>(SEARCH_RESULTS_KEY)
  queryClient.setQueryData<SearchResult[]>(SEARCH_RESULTS_KEY, (old) =>
    old?.flatMap((b) => {
      if (b.id !== id) return [b]
      const next = patch(b)
      return next ? [next] : []
    })
  )
  return previous
}

/** patchSearchResult가 반환한 스냅샷으로 되돌린다 (mutation 실패 롤백용) */
export function restoreSearchResults(
  queryClient: QueryClient,
  previous: SearchResult[] | undefined
): void {
  if (previous) queryClient.setQueryData(SEARCH_RESULTS_KEY, previous)
}

export function useSearch() {
  const queryClient = useQueryClient()
  const [visibleCount, setVisibleCount] = useState(SEARCH_PAGE_SIZE)

  const mutation = useMutation({
    mutationFn: fetchSearch,
    onSuccess: (data) => {
      // 새 검색 결과가 도착할 때마다 리셋 — 이전 검색의 스크롤 진행이 다음 검색에 남지 않는다.
      setVisibleCount(SEARCH_PAGE_SIZE)
      queryClient.setQueryData(SEARCH_RESULTS_KEY, data.results)
    },
  })

  // 조회는 위 mutation이 담당 — 이 useQuery는 캐시 구독 전용(enabled: false)이라 fetch하지 않는다.
  const { data: results } = useQuery({
    queryKey: SEARCH_RESULTS_KEY,
    queryFn: (): SearchResult[] => [],
    enabled: false,
    initialData: (): SearchResult[] => [],
  })
  const allResults = useMemo(() => results ?? [], [results])
  const visibleResults = useMemo(
    () => allResults.slice(0, visibleCount),
    [allResults, visibleCount],
  )
  const hasMore = visibleCount < allResults.length
  const showMore = useCallback(() => {
    setVisibleCount((count) => count + SEARCH_PAGE_SIZE)
  }, [])

  // 검색창 결과수 피드백(SearchBar)용 — 실제 매칭 총량(top-60 캡)
  return { ...mutation, visibleResults, hasMore, showMore, total: allResults.length }
}
