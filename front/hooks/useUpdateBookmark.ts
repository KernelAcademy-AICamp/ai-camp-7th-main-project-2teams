import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { resolveTopCategory } from '@/lib/tag-alias'
import type { Bookmark, BookmarksPage } from './useBookmarks'

export interface UpdateBookmarkFields {
  tags?: string[]
  /** 대분류 이름(또는 alias) — 유효성 검증은 서버(tag-alias.ts 기준)에서 수행. null = 미분류로 해제 */
  category?: string | null
  description?: string | null
}

export interface UpdateBookmarkVariables extends UpdateBookmarkFields {
  id: string
}

/** PATCH /api/bookmarks/:id 호출 — 테스트 가능하도록 export */
export async function fetchUpdateBookmark(
  id: string,
  fields: UpdateBookmarkFields
): Promise<{ bookmark: Bookmark }> {
  const res = await fetch(`/api/bookmarks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  if (!res.ok) throw new Error(`Update bookmark failed: ${res.status}`)
  return res.json()
}

/**
 * onMutate에서 사용하는 캐시 변환 함수 (tags·description 즉시 반영).
 * 테스트 가능하도록 export — 실제 queryClient 없이 순수 로직 검증.
 * category_id는 서버가 upsert로 새로 발급한 값이라 낙관적으로 알 수 없음 — onSettled invalidate로 동기화.
 */
export function applyOptimisticUpdate(
  old: InfiniteData<BookmarksPage> | undefined,
  id: string,
  fields: UpdateBookmarkFields
): InfiniteData<BookmarksPage> | undefined {
  if (!old) return old
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      bookmarks: page.bookmarks.map((b) => {
        if (b.id !== id) return b
        return {
          ...b,
          ...(fields.tags !== undefined ? { tags: fields.tags } : {}),
          ...(fields.description !== undefined ? { description: fields.description } : {}),
        }
      }),
    })),
  }
}

/**
 * 현재 쿼리 필터(category/tag)와 변경 후 값이 어긋나는지 판단.
 * 어긋나면 해당 페이지에서 낙관적으로 제거해야 함(더 이상 이 필터 결과에 속하지 않음).
 * category는 alias 입력 가능 → resolveTopCategory로 표준명 변환 후 비교(서버와 동일 로직).
 * 테스트 가능하도록 export.
 */
export function isFilterMismatch(
  filters: Record<string, string | undefined> | undefined,
  fields: UpdateBookmarkFields
): boolean {
  if (!filters) return false

  if (filters.category && fields.category !== undefined) {
    if (fields.category === null) return true
    const resolved = resolveTopCategory(fields.category)
    if (resolved !== filters.category) return true
  }

  if (filters.tag && fields.tags !== undefined && !fields.tags.includes(filters.tag)) {
    return true
  }

  return false
}

/** 대상 페이지들에서 id에 해당하는 북마크를 제거 — 필터 불일치 시 낙관적 제거용 */
function removeFromPages(
  data: InfiniteData<BookmarksPage>,
  id: string
): InfiniteData<BookmarksPage> {
  return {
    ...data,
    pages: data.pages.map((page) => {
      const filtered = page.bookmarks.filter((b) => b.id !== id)
      const removed = page.bookmarks.length - filtered.length
      return { bookmarks: filtered, total: Math.max(0, page.total - removed) }
    }),
  }
}

export function useUpdateBookmark() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...fields }: UpdateBookmarkVariables) => fetchUpdateBookmark(id, fields),

    onMutate: async ({ id, ...fields }) => {
      // 진행 중인 refetch를 취소하여 낙관적 업데이트 덮어쓰기 방지
      await queryClient.cancelQueries({ queryKey: ['bookmarks'] })

      // 롤백용 현재 캐시 스냅샷 저장
      const previousData = queryClient.getQueriesData<InfiniteData<BookmarksPage>>({
        queryKey: ['bookmarks'],
      })

      for (const [queryKey, data] of previousData) {
        if (!data) continue

        // queryKey[1]은 filters 객체 — category/tag 필터와 변경값 불일치 시 즉시 제거
        const filters = queryKey[1] as Record<string, string | undefined> | undefined

        const updated = isFilterMismatch(filters, fields)
          ? removeFromPages(data, id)
          : applyOptimisticUpdate(data, id, fields) ?? data

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
      // 성공·실패 무관하게 서버 상태로 최종 동기화 (category_id 등 낙관적으로 못 채운 필드 포함)
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
  })
}
