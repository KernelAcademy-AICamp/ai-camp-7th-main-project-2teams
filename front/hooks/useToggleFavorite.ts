import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import type { Bookmark, BookmarksPage } from './useBookmarks'
import { patchSearchResult, restoreSearchResults } from './useSearch'

export interface ToggleFavoriteVariables {
  id: string
  /** 전송할 새 값 — 현재 상태의 반대 */
  is_favorite: boolean
}

/** PATCH /api/bookmarks/:id 호출 — 테스트 가능하도록 export */
export async function fetchToggleFavorite(
  id: string,
  is_favorite: boolean
): Promise<{ bookmark: Bookmark }> {
  const res = await fetch(`/api/bookmarks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_favorite }),
  })
  if (!res.ok) throw new Error(`Toggle favorite failed: ${res.status}`)
  return res.json()
}

/**
 * onMutate에서 사용하는 캐시 변환 함수 (is_favorite 값 토글).
 * 테스트 가능하도록 export — 실제 queryClient 없이 순수 로직 검증.
 */
export function applyOptimisticToggle(
  old: InfiniteData<BookmarksPage> | undefined,
  id: string,
  is_favorite: boolean
): InfiniteData<BookmarksPage> | undefined {
  if (!old) return old
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      bookmarks: page.bookmarks.map((b) => (b.id === id ? { ...b, is_favorite } : b)),
    })),
  }
}

export function useToggleFavorite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, is_favorite }: ToggleFavoriteVariables) =>
      fetchToggleFavorite(id, is_favorite),

    onMutate: async ({ id, is_favorite }) => {
      // 진행 중인 refetch를 취소하여 낙관적 업데이트 덮어쓰기 방지
      await queryClient.cancelQueries({ queryKey: ['bookmarks'] })

      // 롤백용 현재 캐시 스냅샷 저장
      const previousData = queryClient.getQueriesData<InfiniteData<BookmarksPage>>({
        queryKey: ['bookmarks'],
      })

      // 각 ['bookmarks', filters] 캐시 개별 업데이트
      for (const [queryKey, data] of previousData) {
        if (!data) continue

        // queryKey[1]은 filters 객체 — tab 값으로 현재 탭 확인
        const filters = queryKey[1] as Record<string, string | undefined> | undefined
        const isInFavoritesTab = filters?.tab === 'favorites'

        let updated: InfiniteData<BookmarksPage>

        if (isInFavoritesTab && !is_favorite) {
          // 즐겨찾기 탭에서 해제 → 해당 아이템 즉시 제거 (낙관적), 모든 페이지에서
          updated = {
            ...data,
            pages: data.pages.map((page) => {
              const filtered = page.bookmarks.filter((b) => b.id !== id)
              const removed = page.bookmarks.length - filtered.length
              return { bookmarks: filtered, total: Math.max(0, page.total - removed) }
            }),
          }
        } else {
          // 그 외: is_favorite 값만 토글
          updated = applyOptimisticToggle(data, id, is_favorite) ?? data
        }

        queryClient.setQueryData(queryKey, updated)
      }

      // 검색 결과는 ['bookmarks'] 캐시와 별도로 보관되므로 따로 갱신 — 누락 시 검색 화면에서
      // 별 아이콘이 반응하지 않는다.
      const previousSearch = patchSearchResult(queryClient, id, (b) => ({ ...b, is_favorite }))

      return { previousData, previousSearch }
    },

    onError: (_err, _variables, context) => {
      // PATCH 실패 시 스냅샷으로 캐시 복원 (롤백)
      if (context?.previousData) {
        for (const [queryKey, data] of context.previousData) {
          queryClient.setQueryData(queryKey, data)
        }
      }
      restoreSearchResults(queryClient, context?.previousSearch)
    },

    onSettled: () => {
      // 즐겨찾기 탭 카테고리 목록 즉시 갱신 (staleTime 60s 대기 없이 반영)
      queryClient.invalidateQueries({ queryKey: ['categories'] })

      // 낙관적 업데이트는 캐시에 이미 있는 항목만 수정한다 — 즐겨찾기 추가 시
      // 즐겨찾기 탭 캐시에는 그 북마크가 없어 목록에 나타나지 않는다.
      // refetchType: 'none'으로 stale 표시만 하여 현재 보는 목록은 재조회하지 않고,
      // 탭 전환 시 마운트 refetch로 신규 항목이 채워지게 한다.
      queryClient.invalidateQueries({ queryKey: ['bookmarks'], refetchType: 'none' })
    },
  })
}
