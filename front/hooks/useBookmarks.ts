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
  /** 저장 시점 404/410 감지 결과 — true면 카드에 "링크 끊김" 배지 표시(비차단) */
  is_dead: boolean
  created_at: string
}

interface BookmarksFilters {
  tab?: string
  category?: string
  /** 루트부터 선택 노드까지 전체 경로 — API 전달 시 '/'로 조인(동명이인 폴더 구분용) */
  folder?: string[]
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
      const { folder, ...rest } = filters
      const params = new URLSearchParams(
        Object.fromEntries(
          Object.entries(rest).filter(([, v]) => v != null)
        ) as Record<string, string>
      )
      if (folder && folder.length > 0) params.set('folder', folder.join('/'))
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
