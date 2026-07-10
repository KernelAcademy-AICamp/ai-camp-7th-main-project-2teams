import { useMutation, useQueryClient } from '@tanstack/react-query'

/** POST /api/bookmarks 응답 — route.ts의 명시 select 컬럼과 동일(embedding 제외) */
export interface AddedBookmark {
  id: string
  url: string
  title: string
  tags: string[]
  category_id: string | null
  folder_hint: string | null
  is_favorite: boolean
  thumbnail_url: string | null
  is_dead: boolean
  created_at: string
}

/**
 * POST /api/bookmarks 호출 — 테스트 가능하도록 export.
 * 409 중복 응답(duplicate: true)일 때 던지는 Error에 duplicate 플래그를 실어
 * 소비 측(AddBookmarkModal)이 일반 실패와 구분할 수 있게 한다. (A59)
 */
export async function postAddBookmark({
  url,
  title,
}: {
  url: string
  title: string
}): Promise<{ bookmark: AddedBookmark }> {
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
