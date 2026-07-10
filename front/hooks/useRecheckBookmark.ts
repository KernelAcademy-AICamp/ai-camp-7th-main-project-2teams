import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import type { BookmarksPage } from './useBookmarks'

export interface RecheckResult {
  id: string
  is_dead: boolean
}

/** POST /api/bookmarks/:id/recheck 호출 — 테스트 가능하도록 export */
export async function fetchRecheckBookmark(id: string): Promise<{ bookmark: RecheckResult }> {
  const res = await fetch(`/api/bookmarks/${id}/recheck`, { method: 'POST' })
  if (!res.ok) throw new Error(`재검사 실패 (${res.status})`)
  return res.json()
}

/** 재검사 결과로 캐시의 is_dead만 갱신 — 테스트 가능하도록 export */
export function applyRecheckResult(
  old: InfiniteData<BookmarksPage> | undefined,
  id: string,
  is_dead: boolean,
): InfiniteData<BookmarksPage> | undefined {
  if (!old) return old
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      bookmarks: page.bookmarks.map((b) => (b.id === id ? { ...b, is_dead } : b)),
    })),
  }
}

export function useRecheckBookmark() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: fetchRecheckBookmark,
    onSuccess: ({ bookmark }) => {
      const previousData = queryClient.getQueriesData<InfiniteData<BookmarksPage>>({
        queryKey: ['bookmarks'],
      })
      for (const [queryKey, data] of previousData) {
        if (!data) continue
        queryClient.setQueryData(queryKey, applyRecheckResult(data, bookmark.id, bookmark.is_dead))
      }
    },
  })
}
