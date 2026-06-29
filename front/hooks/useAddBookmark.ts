import { useMutation, useQueryClient } from '@tanstack/react-query'

export function useAddBookmark() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ url, title }: { url: string; title: string }) => {
      const res = await fetch('/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, url, content: '' }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || `저장 실패 (${res.status})`)
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] })
      queryClient.invalidateQueries({ queryKey: ['folders'] })
    },
  })
}
