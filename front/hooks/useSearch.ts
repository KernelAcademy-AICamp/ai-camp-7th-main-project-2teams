import { useMutation } from '@tanstack/react-query'
import type { Bookmark } from './useBookmarks'

export interface SearchResult extends Bookmark {
  similarity: number
}

export function useSearch() {
  return useMutation({
    mutationFn: async (query: string): Promise<{ results: SearchResult[] }> => {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      if (!res.ok) throw new Error(`Search failed: ${res.status}`)
      return res.json()
    },
  })
}
