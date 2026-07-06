import { useMutation, useQueryClient } from '@tanstack/react-query'

/**
 * POST /api/bookmarks 호출 — 테스트 가능하도록 export.
 * 409 중복 응답(duplicate: true)일 때 던지는 Error에 duplicate 플래그를 실어
 * 소비 측(AddBookmarkModal)이 일반 실패와 구분할 수 있게 한다. (A59)
 */
export async function postAddBookmark({ url, title }: { url: string; title: string }) {
  const res = await fetch('/api/bookmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, url, content: '' }),
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    const err = new Error(json.error || `저장 실패 (${res.status})`)
    if (json.duplicate) Object.assign(err, { duplicate: true })
    throw err
  }
  return res.json()
}

export function useAddBookmark() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: postAddBookmark,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] })
      queryClient.invalidateQueries({ queryKey: ['folders'] })
    },
  })
}
