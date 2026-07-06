import { useMutation } from '@tanstack/react-query'
import type { Bookmark } from './useBookmarks'

export interface SearchResult extends Bookmark {
  similarity: number
}

interface SearchParams {
  query: string
  category?: string
  // A58: 사이드바 태그/즐겨찾기 필터를 검색에도 그대로 전달 — 미지정 시 기존 전체 검색과 동일.
  tag?: string
  is_favorite?: boolean
}

// fetchDeleteBookmark(useDeleteBookmark.ts)와 동일 패턴 — 훅과 분리해 순수 함수로 단위 테스트 가능.
export async function fetchSearch({
  query,
  category,
  tag,
  is_favorite,
}: SearchParams): Promise<{ results: SearchResult[] }> {
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, category, tag, is_favorite }),
  })
  if (!res.ok) throw new Error(`Search failed: ${res.status}`)
  return res.json()
}

export function useSearch() {
  return useMutation({
    mutationFn: fetchSearch,
  })
}
