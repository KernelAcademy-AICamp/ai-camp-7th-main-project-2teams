import { useMutation, useQueryClient } from '@tanstack/react-query'

export interface ImportResult {
  imported: number
  failed: number
  skipped: number
}

/** 바이트를 사람이 읽기 쉬운 단위로 변환 — 테스트 가능하도록 export */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * POST /api/bookmarks/import 호출 — FormData body.
 * Content-Type 수동 설정 금지: 브라우저가 multipart/form-data + boundary 자동 설정.
 * 테스트 가능하도록 export.
 */
export async function fetchImportBookmarks(formData: FormData): Promise<ImportResult> {
  const res = await fetch('/api/bookmarks/import', {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    // 413(크기 초과)은 고정 메시지 — JSON body 없을 수 있음
    if (res.status === 413) {
      throw new Error('파일 크기가 너무 큽니다. 5MB 이하로 업로드해주세요.')
    }
    // 413 외(400 포함): 서버 JSON error 우선, 없으면 상태별 fallback
    let message =
      res.status === 400
        ? 'HTML 파일(.html)만 업로드할 수 있습니다.'
        : `업로드 실패 (${res.status})`
    try {
      const json = await res.json()
      if (json?.error) message = json.error
    } catch {
      // JSON 파싱 실패 시 fallback 메시지 유지
    }
    throw new Error(message)
  }

  return res.json()
}

export function useImportBookmarks() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: fetchImportBookmarks,
    onSuccess: () => {
      // 임포트 완료 후 북마크 목록 캐시 무효화 → 홈 목록에 즉시 반영
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] })
    },
  })
}
