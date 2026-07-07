import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import type { Bookmark, BookmarksPage } from './useBookmarks'

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

      return { previousData }
    },

    onError: (_err, _variables, context) => {
      // PATCH 실패 시 스냅샷으로 캐시 복원 (롤백)
      if (context?.previousData) {
        for (const [queryKey, data] of context.previousData) {
          queryClient.setQueryData(queryKey, data)
        }
      }
    },

    onSettled: () => {
      // bookmarks는 onMutate 낙관적 업데이트로 이미 정확 — 재조회 불필요 (전체 리스트 refetch 방지)
      // 즐겨찾기 탭 카테고리 목록만 즉시 갱신 (staleTime 60s 대기 없이 반영)
      queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
  })
}
