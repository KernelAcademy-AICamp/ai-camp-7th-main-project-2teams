import { withAuth } from '@/lib/auth'

interface BookmarkRow {
  category_id: string | null
}
interface CategoryRow {
  id: string
  name: string
}

/**
 * 본인 북마크에 실제 붙은 카테고리명 distinct + 미분류(category_id null) 존재 여부.
 * 사이드바 필터 목록용 — 페이지네이션과 무관한 전체 집계라 목록 API의 limit(20)에 잘리면 안 된다.
 */
// ponytail: JS 집계, 북마크 많아지면 distinct RPC로 (folders 라우트와 동일 전략)
export function extractCategories(
  bookmarks: BookmarkRow[],
  categories: CategoryRow[],
): { categories: string[]; hasUncategorized: boolean } {
  const nameById = new Map(categories.map((c) => [c.id, c.name]))
  const names: string[] = []
  const seen = new Set<string>()
  let hasUncategorized = false
  for (const b of bookmarks) {
    const name = b.category_id ? nameById.get(b.category_id) : undefined
    if (name) {
      if (!seen.has(name)) {
        seen.add(name)
        names.push(name)
      }
    } else {
      // category_id null 또는 삭제된 카테고리 참조 → 미분류로 묶음
      hasUncategorized = true
    }
  }
  return { categories: names, hasUncategorized }
}

// 본인 북마크의 카테고리 목록. RLS 외 user_id 명시적 격리, embedding 컬럼 제외.
// is_favorite=true 쿼리 시 즐겨찾기 북마크만 집계 (사이드바 즐겨찾기 탭 카테고리 목록용).
export const GET = withAuth(async (req, { supabase, user }) => {
  const { searchParams } = new URL(req.url)
  const favoritesOnly = searchParams.get('is_favorite') === 'true'

  const { data: cats, error: catErr } = await supabase
    .from('categories')
    .select('id, name')
    .eq('user_id', user.id)
  if (catErr) {
    return Response.json({ error: catErr.message }, { status: 500 })
  }

  let bookmarksQuery = supabase.from('bookmarks').select('category_id').eq('user_id', user.id)
  if (favoritesOnly) {
    bookmarksQuery = bookmarksQuery.eq('is_favorite', true)
  }
  const { data: rows, error } = await bookmarksQuery
  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(
    extractCategories((rows ?? []) as BookmarkRow[], (cats ?? []) as CategoryRow[]),
  )
})
