import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Bookmark } from './useBookmarks'

/** DELETE /api/bookmarks/:id 호출 — 테스트 가능하도록 export */
export async function fetchDeleteBookmark(id: string): Promise<{ success: true }> {
  const res = await fetch(`/api/bookmarks/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`Delete bookmark failed: ${res.status}`)
  return res.json()
}

/**
 * onMutate에서 사용하는 캐시 변환 함수 (해당 id 북마크 제거 + total 감소).
 * 테스트 가능하도록 export — 실제 queryClient 없이 순수 로직 검증.
 */
export function applyOptimisticDelete(
  old: { bookmarks: Bookmark[]; total: number } | undefined,
  id: string
): { bookmarks: Bookmark[]; total: number } | undefined {
  if (!old) return old
  const filtered = old.bookmarks.filter((b) => b.id !== id)
  const removed = old.bookmarks.length - filtered.length
  return {
    bookmarks: filtered,
    total: Math.max(0, old.total - removed),
  }
}

export function useDeleteBookmark() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => fetchDeleteBookmark(id),

    onMutate: async (id: string) => {
      // 진행 중인 refetch를 취소하여 낙관적 업데이트 덮어쓰기 방지
      await queryClient.cancelQueries({ queryKey: ['bookmarks'] })

      // 롤백용 현재 캐시 스냅샷 저장
      const previousData = queryClient.getQueriesData<{
        bookmarks: Bookmark[]
        total: number
      }>({ queryKey: ['bookmarks'] })

      // 각 ['bookmarks', filters] 캐시에서 해당 북마크 제거
      for (const [queryKey, data] of previousData) {
        if (!data) continue
        queryClient.setQueryData(queryKey, applyOptimisticDelete(data, id) ?? data)
      }

      return { previousData }
    },

    onError: (_err, _id, context) => {
      // DELETE 실패 시 스냅샷으로 캐시 복원 (롤백)
      if (context?.previousData) {
        for (const [queryKey, data] of context.previousData) {
          queryClient.setQueryData(queryKey, data)
        }
      }
    },

    onSettled: () => {
      // 성공·실패 무관하게 서버 상태로 최종 동기화
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] })
    },
  })
}
