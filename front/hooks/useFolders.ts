import { useQuery } from '@tanstack/react-query'

export interface FoldersData {
  folders: string[] // 평면 distinct (탭 노출 조건)
  paths: string[][] // 트리 구성용 전체 경로
}

/** GET /api/bookmarks/folders — folder_hint 평면 목록 + 트리용 경로 */
export async function fetchFolders(): Promise<FoldersData> {
  const res = await fetch('/api/bookmarks/folders')
  if (!res.ok) throw new Error('폴더 목록 조회 실패')
  const json = await res.json()
  // 런타임 가드: 서버 응답 형태 이상 시 빈 배열 fallback
  return {
    folders: Array.isArray(json.folders) ? (json.folders as string[]) : [],
    paths: Array.isArray(json.paths) ? (json.paths as string[][]) : [],
  }
}

export function useFolders() {
  return useQuery({
    queryKey: ['folders'],
    queryFn: fetchFolders,
    staleTime: 1000 * 60, // 1분 (useBookmarks와 일관, Extension 저장 후 stale 창 축소)
  })
}
