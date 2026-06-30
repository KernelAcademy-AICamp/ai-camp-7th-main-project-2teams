import { withAuth } from '@/lib/auth'

/** folder_hint 배열의 모든 depth 폴더명을 distinct·정렬해 반환 (하위 폴더 포함) */
// ponytail: JS 집계, 북마크 수 많아지면 distinct RPC로
export function extractFolders(rows: { folder_hint: string[] | null }[]): string[] {
  const set = new Set<string>()
  for (const row of rows) {
    if (!Array.isArray(row.folder_hint)) continue
    for (const name of row.folder_hint) {
      // 빈 문자열 제외: folder='' 쿼리 방지
      if (name) set.add(name)
    }
  }
  return [...set].sort()
}

// 본인 북마크의 folder_hint 전체 depth distinct 목록 반환. embedding 컬럼 제외.
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

  const folders = extractFolders(data ?? [])
  return Response.json({ folders })
})
