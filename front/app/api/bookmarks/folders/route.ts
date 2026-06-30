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

/** folder_hint 경로를 distinct 배열로 반환 (빈 세그먼트 제거). 트리 구성용 */
export function extractFolderPaths(rows: { folder_hint: string[] | null }[]): string[][] {
  const seen = new Set<string>()
  const result: string[][] = []
  for (const row of rows) {
    if (!Array.isArray(row.folder_hint)) continue
    const path = row.folder_hint.filter(Boolean)
    if (path.length === 0) continue
    const key = JSON.stringify(path)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(path)
  }
  return result
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

  const rows = data ?? []
  // folders: 평면 distinct (탭 노출 조건용), paths: 트리 구성용
  return Response.json({ folders: extractFolders(rows), paths: extractFolderPaths(rows) })
})
