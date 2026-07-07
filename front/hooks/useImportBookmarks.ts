import { useMutation, useQueryClient } from '@tanstack/react-query'

export interface ImportResult {
  imported: number
  failed: number
  skipped: number
  duplicate: number
  /** A61: 실패 URL·사유 상세 목록 — done 이벤트에서만 전달(진행률 이벤트에는 없음) */
  failedItems: { url: string; reason: string }[]
}

export interface ImportProgress {
  total: number
  done: number
  imported: number
  duplicate: number
  failed: number
  skipped: number
}

interface ImportMutationInput {
  formData: FormData
  onProgress?: (progress: ImportProgress) => void
}

/** 바이트를 사람이 읽기 쉬운 단위로 변환 — 테스트 가능하도록 export */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * POST /api/bookmarks/import 호출 — FormData body, SSE 스트림 응답 파싱.
 * Content-Type 수동 설정 금지: 브라우저가 multipart/form-data + boundary 자동 설정.
 * 사전 검증 실패(400/413)는 여전히 일반 JSON 에러 응답 — 스트림 진입 전 단계라 기존 처리 그대로.
 * 처리 단계는 SSE로 진행률(progress) 이벤트를 보내고, 완료 시 done 이벤트로 최종 결과 전달.
 * 테스트 가능하도록 export.
 */
export async function fetchImportBookmarks(
  formData: FormData,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportResult> {
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
        ? 'HTML(.html) 또는 CSV(.csv) 파일만 업로드할 수 있습니다.'
        : `업로드 실패 (${res.status})`
    try {
      const json = await res.json()
      if (json?.error) message = json.error
    } catch {
      // JSON 파싱 실패 시 fallback 메시지 유지
    }
    throw new Error(message)
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let sepIndex: number
    while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
      const line = buffer.slice(0, sepIndex)
      buffer = buffer.slice(sepIndex + 2)
      if (!line.startsWith('data: ')) continue

      const event = JSON.parse(line.slice(6))
      if (event.type === 'progress') {
        onProgress?.(event)
      } else if (event.type === 'error') {
        throw new Error(event.message)
      } else if (event.type === 'done') {
        const { imported, failed, skipped, duplicate, failedItems } = event
        return { imported, failed, skipped, duplicate, failedItems }
      }
    }
  }

  // done 이벤트 없이 스트림이 끝남 — 네트워크 조기 종료
  throw new Error('업로드 중 연결이 끊겼습니다. 다시 시도해주세요.')
}

export function useImportBookmarks() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ formData, onProgress }: ImportMutationInput) =>
      fetchImportBookmarks(formData, onProgress),
    onSuccess: () => {
      // 임포트 완료 후 북마크 목록 캐시 무효화 → 홈 목록에 즉시 반영
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] })
      // 임포트로 folder_hint가 생길 수 있으므로 폴더 목록도 무효화 → 사이드바 즉시 반영
      queryClient.invalidateQueries({ queryKey: ['folders'] })
    },
  })
}
