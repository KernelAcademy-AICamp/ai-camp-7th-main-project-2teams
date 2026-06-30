import { useQuery, keepPreviousData } from '@tanstack/react-query'

export interface Bookmark {
  id: string
  title: string
  url: string
  tags: string[]
  category_id: string | null
  /** AI가 지정한 대분류 이름 (null = 미분류). 평면 모델에서 tags[0]과 무관. */
  category: string | null
  is_favorite: boolean
  folder_hint: string[] | null
  created_at: string
}

interface BookmarksFilters {
  tab?: string
  category?: string
  folder?: string
  tag?: string
}

export function useBookmarks(filters: BookmarksFilters) {
  return useQuery({
    queryKey: ['bookmarks', filters],
    queryFn: async (): Promise<{ bookmarks: Bookmark[]; total: number }> => {
      const params = new URLSearchParams(
        Object.fromEntries(
          Object.entries(filters).filter(([, v]) => v != null)
        ) as Record<string, string>
      )
      const res = await fetch(`/api/bookmarks?${params}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
  })
}
