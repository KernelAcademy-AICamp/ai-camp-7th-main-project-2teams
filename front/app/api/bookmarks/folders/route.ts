import { withAuth } from '@/lib/auth'

/** folder_hint 배열 목록에서 최상위 폴더(index 0)를 distinct·정렬해 반환 */
// ponytail: JS 집계, 북마크 수 많아지면 distinct RPC로
export function extractTopFolders(rows: { folder_hint: string[] | null }[]): string[] {
  const set = new Set<string>()
  for (const row of rows) {
    // 빈 문자열 제외: folder='' 쿼리 방지
    if (Array.isArray(row.folder_hint) && row.folder_hint.length > 0 && row.folder_hint[0]) {
      set.add(row.folder_hint[0])
    }
  }
  return [...set].sort()
}

// 본인 북마크의 folder_hint[0] distinct 목록 반환. embedding 컬럼 제외.
// RLS 외 user_id 명시적 격리 (A27 패턴과 통일).
export const GET = withAuth(async (_req, { supabase, user }) => {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('folder_hint')
    .eq('user_id', user.id)
    .not('folder_hint', 'is', null)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const folders = extractTopFolders(data ?? [])
  return Response.json({ folders })
})
