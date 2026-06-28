import { useQuery } from '@tanstack/react-query'

/** GET /api/bookmarks/folders — folder_hint[0] distinct 목록 */
export async function fetchFolders(): Promise<string[]> {
  const res = await fetch('/api/bookmarks/folders')
  if (!res.ok) throw new Error('폴더 목록 조회 실패')
  const json = await res.json()
  // 런타임 가드: 서버 응답 형태 이상 시 빈 배열 fallback
  return Array.isArray(json.folders) ? (json.folders as string[]) : []
}

export function useFolders() {
  return useQuery({
    queryKey: ['folders'],
    queryFn: fetchFolders,
    staleTime: 1000 * 60, // 1분 (useBookmarks와 일관, Extension 저장 후 stale 창 축소)
  })
}
