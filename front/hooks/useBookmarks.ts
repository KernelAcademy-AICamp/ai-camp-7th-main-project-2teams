import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query'

export interface Bookmark {
  id: string
  title: string
  url: string
  description?: string | null
  tags: string[]
  category_id: string | null
  /** category_id → 이름 조인 (GET /api/bookmarks만 제공) — 카드 수정 모달 카테고리 default 선택용 */
  category?: string | null
  is_favorite: boolean
  folder_hint: string[] | null
  /** og:image/YouTube 썸네일 원본 URL — 직접 렌더링 금지, /api/thumbnail 프록시 경유 */
  thumbnail_url?: string | null
  created_at: string
}

interface BookmarksFilters {
  tab?: string
  category?: string
  folder?: string
  tag?: string
}

export interface BookmarksPage {
  bookmarks: Bookmark[]
  total: number
}

// GET /api/bookmarks의 기존 limit 기본값(20)과 동일하게 유지 — 백엔드 계약 그대로 소비.
const PAGE_SIZE = 20

// A62: useQuery → useInfiniteQuery. GET /api/bookmarks는 이미 page/limit/total을 지원했으나
// 프론트가 소비하지 않던 갭을 메운다(신규 backend 구현 아님).
export function useBookmarks(filters: BookmarksFilters) {
  return useInfiniteQuery({
    queryKey: ['bookmarks', filters],
    queryFn: async ({ pageParam }): Promise<BookmarksPage> => {
      const params = new URLSearchParams(
        Object.fromEntries(
          Object.entries(filters).filter(([, v]) => v != null)
        ) as Record<string, string>
      )
      params.set('page', String(pageParam))
      params.set('limit', String(PAGE_SIZE))
      const res = await fetch(`/api/bookmarks?${params}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.flatMap((p) => p.bookmarks).length
      return loaded < lastPage.total ? allPages.length + 1 : undefined
    },
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
  })
}
