import { useMutation } from '@tanstack/react-query'
import type { Bookmark } from './useBookmarks'

export interface SearchResult extends Bookmark {
  similarity: number
}

interface SearchParams {
  query: string
  category?: string
}

export function useSearch() {
  return useMutation({
    mutationFn: async ({ query, category }: SearchParams): Promise<{ results: SearchResult[] }> => {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, category }),
      })
      if (!res.ok) throw new Error(`Search failed: ${res.status}`)
      return res.json()
    },
  })
}
