import { useQuery } from '@tanstack/react-query'

export interface CategoriesData {
  categories: string[] // 본인 북마크에 붙은 카테고리명 distinct
  hasUncategorized: boolean // category_id null 북마크 존재 여부 → '미분류' 노출
}

/** GET /api/bookmarks/categories — 필터 목록용 카테고리 (페이지네이션 무관 전체 집계) */
export async function fetchCategories(): Promise<CategoriesData> {
  const res = await fetch('/api/bookmarks/categories')
  if (!res.ok) throw new Error('카테고리 목록 조회 실패')
  const json = await res.json()
  // 런타임 가드: 서버 응답 형태 이상 시 안전 fallback
  return {
    categories: Array.isArray(json.categories) ? (json.categories as string[]) : [],
    hasUncategorized: json.hasUncategorized === true,
  }
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    staleTime: 1000 * 60, // useFolders·useBookmarks와 일관
  })
}
