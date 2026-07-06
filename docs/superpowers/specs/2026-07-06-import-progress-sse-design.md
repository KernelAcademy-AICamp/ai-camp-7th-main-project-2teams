# 북마크 임포트 SSE 진행률 스트리밍 설계

- 날짜: 2026-07-06
- 대상: `front/app/api/bookmarks/import/route.ts`, `front/hooks/useImportBookmarks.ts`, `front/app/(dashboard)/import/page.tsx` (+ 각 테스트)
- 관련 미구현 대안 문서: `docs/specs/import-progress-background-jobs.md` (대량 임포트용 백그라운드 job + Redis — 이 SSE 방식으로 해결 안 되는 `maxDuration` 타임아웃 리스크 대응용, 별도 전환 기준 있음)

## 배경

`POST /api/bookmarks/import`는 단일 요청 안에서 파싱→중복필터→AI태깅/임베딩→저장을 전부 처리하고 끝나야 최종 JSON 응답 하나를 반환한다. 처리 중 클라이언트는 스피너만 보고, 실제로 몇 건 처리됐는지 알 방법이 없다. 임포트 건수가 많아지면(수십~수백 건) 체감 대기시간이 길어져 UX 문제가 된다.

이 문서는 **같은 요청 수명 안에서** 진행률을 실시간으로 보여주는 SSE(Server-Sent Events) 스트리밍 방식을 다룬다. `maxDuration`(300s) 타임아웃 자체를 없애는 근본 해결책은 아니며(그건 백그라운드 job 방식의 몫), 지금 규모(안전 구간 ~250건 이하)에서 체감 대기시간을 줄이는 게 목적이다.

이 엔드포인트는 `front/app/(dashboard)/import/page.tsx` 하나만 소비한다 — 다른 소비자 없음, 하위호환 고려 없이 응답 포맷을 그대로 교체한다.

## 목표 동작

1. 파일 검증(타입/크기, 400/413)은 기존과 동일하게 즉시 JSON 에러 응답 — 스트림 진입 전 단계라 변경 없음.
2. 검증 통과 후 처리 단계부터 응답을 SSE 스트림으로 전환. 각 항목이 종결 처리(완전 스킵/폴더 갱신/AI 처리 성공·실패)되는 즉시 진행률 이벤트 전송 — 항목 단위 갱신, 청크(5개/20개) 전체가 끝날 때까지 기다리지 않음.
3. 진행률 바의 분모(`total`)는 **배치 내부 dedupe 후, MAX_ITEMS 초과분 제외한 건수**(`candidates.size`) — 사용자가 업로드한 파일 기준 직관적인 총량.
4. 처리 완료 시 `done` 이벤트로 최종 `{ imported, failed, skipped, duplicate }` 전송 — 기존 JSON 응답과 동일한 필드 구성.
5. 스트림 도중 예외 발생 시 `error` 이벤트 전송 후 종료 — 클라이언트가 무한 대기하지 않도록.

## 이벤트 스키마

한 줄 JSON을 SSE `data:` 라인으로 전송, `type` 필드로 구분:

```
data: {"type":"progress","total":42,"done":5,"imported":3,"duplicate":2,"failed":0,"skipped":0}\n\n
...
data: {"type":"done","imported":30,"failed":1,"duplicate":10,"skipped":1}\n\n
```

또는 에러 시:

```
data: {"type":"error","message":"..."}\n\n
```

필드 의미:
- `total`: `candidates.size` — 모든 이벤트에서 동일한 고정값.
- `done`: 지금까지 종결 처리된 항목 수. `done === imported + failed + duplicate`(누적). 진행바는 `done/total`.
- `skipped`: MAX_ITEMS 초과분 — 스트림 시작 전 이미 확정, 모든 이벤트에 참고용으로 동일하게 포함(실시간 변화 없음).
- `done` 이벤트의 필드 구성은 기존 JSON 응답 `{ imported, failed, skipped, duplicate }`과 동일 — `total`/`done` 필드는 `done` 이벤트에는 불필요하므로 생략.

## 백엔드 변경 (`route.ts`)

### 처리 단계를 `ReadableStream`으로 감싸기

파일 검증까지 마친 뒤, 기존 처리 로직(파싱~AI~저장) 전체를 `new ReadableStream({ async start(controller) {...} })` 안으로 이동. 응답은:

```ts
return new Response(stream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  },
})
```

스트림 내부에서 진행률 전송용 헬퍼:

```ts
const encoder = new TextEncoder()
function send(controller: ReadableStreamDefaultController, event: object) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
}
```

### 분류 루프 — 완전 스킵 항목

기존 분류 루프(`for (const item of candidates.values())`)에서 `foldersEqual`이 참이라 완전 스킵되는 항목은 네트워크 작업이 없으므로 판정 즉시 `send(controller, { type:'progress', ...누적값 })` 호출.

### 폴더 갱신 청크 — 항목 단위 이벤트

`needsFolderUpdate` 처리 루프에서 청크 전체(`Promise.all`)가 끝나길 기다리지 않고, 각 항목의 `update()`가 끝나는 그 자리(`chunk.map(async ({...}) => { await supabase...update(...); send(controller, {...}) })`)에서 즉시 이벤트 전송. 동시성(20개)은 기존 그대로 — 이벤트 전송이 동시성 구조를 바꾸지 않음.

### AI 처리 청크 — 항목 단위 이벤트

`toProcess` 처리 루프도 동일하게, 각 항목의 try/catch 블록이 끝나는 시점(imported++ 또는 failed++ 직후)에 즉시 이벤트 전송. 동시성(5개) 기존 그대로.

### 최종 이벤트 + 종료

모든 청크 처리가 끝나면 `send(controller, { type:'done', imported, failed, skipped, duplicate })` 후 `controller.close()`.

### 에러 처리

`start()` 콜백 전체를 try/catch로 감싸 예외 발생 시 `send(controller, { type:'error', message })` 후 `controller.close()` — 스트림이 응답 없이 끊기는 것 방지.

## 프론트 변경

### `front/hooks/useImportBookmarks.ts`

`fetchImportBookmarks`를 스트림 파싱 함수로 재작성:

```ts
export interface ImportProgress {
  total: number
  done: number
  imported: number
  duplicate: number
  failed: number
  skipped: number
}

export async function fetchImportBookmarks(
  formData: FormData,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  const res = await fetch('/api/bookmarks/import', { method: 'POST', body: formData })

  // 사전 검증 실패(400/413)는 여전히 일반 JSON 에러 응답 — 기존 에러 처리 로직 그대로 재사용
  if (!res.ok) {
    // ...기존 400/413 처리 로직 유지...
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
      if (event.type === 'progress') onProgress?.(event)
      if (event.type === 'error') throw new Error(event.message)
      if (event.type === 'done') {
        const { imported, failed, skipped, duplicate } = event
        return { imported, failed, skipped, duplicate }
      }
    }
  }

  // done 이벤트 없이 스트림이 끝남 — 네트워크 조기 종료
  throw new Error('업로드 중 연결이 끊겼습니다. 다시 시도해주세요.')
}
```

`useImportBookmarks`의 `mutationFn`은 `{ formData, onProgress }` 객체를 받아 `fetchImportBookmarks(formData, onProgress)`로 위임하도록 변경. `onSuccess`(캐시 무효화) 로직은 변경 없음.

### `front/app/(dashboard)/import/page.tsx`

- `const [progress, setProgress] = useState<ImportProgress | null>(null)` 추가.
- `handleUpload`에서 `mutation.mutate({ formData, onProgress: setProgress })` 형태로 호출.
- 업로드 중(`isUploading`) 구간에 진행바(`progress.done / progress.total` 퍼센트) + 텍스트(`${progress.done}건 / ${progress.total}건 처리 중`) 표시. `progress`가 아직 `null`(첫 이벤트 도착 전)이면 기존처럼 스피너만.
- 완료 후 결과 패널(4줄: 성공/중복/상한초과/실패)은 기존 그대로, `mutation.data`(= `done` 이벤트 값) 사용.
- 업로드 시작 시 `setProgress(null)`로 리셋(재업로드 대비).

## 에러 처리 요약

- 사전 검증 실패(400/413): 기존과 동일, 변경 없음.
- 스트림 중 서버 예외: `error` 이벤트로 명시적 전달 → 클라이언트에서 throw → 기존 `isError` UI로 표시.
- 스트림 조기 종료(네트워크 끊김, `done` 이벤트 못 받음): 클라이언트에서 별도 에러 메시지로 throw → 기존 `isError` UI로 표시.

## 테스트 계획

### 백엔드 (`front/app/api/bookmarks/import/__tests__/route.test.ts`)

- 기존 24개 테스트: 응답이 스트림이 되므로, 스트림을 끝까지 읽어 `done` 이벤트 값을 파싱하는 테스트 헬퍼(`readFinalResult(res)`)로 감싸 기존 assertion(`json.imported` 등) 재사용.
- 신규: progress 이벤트가 항목 수만큼(중복 스킵 포함) 발생하는지, 각 이벤트의 `done` 누적값이 단조 증가하는지, 마지막 progress 이벤트의 `done === total`인지 검증.
- 신규: 스트림 도중 예외(예: 개별 upsert 호출에서 throw) 발생 시 `error` 이벤트가 오는지 검증(단, 기존 개별 항목 예외는 `failed++`로 흡수되는 설계라 실제로 최상위 예외가 발생하는 경로는 드묾 — 강제로 최상위 예외를 유발하는 방식은 구현 단계에서 확정).

### 프론트 (`front/hooks/__tests__/useImportBookmarks.test.ts`)

- 스트림 mock(`ReadableStream` 또는 청크 배열을 순서대로 반환하는 mock reader)으로 `onProgress` 콜백이 각 progress 이벤트마다 호출되는지, 최종 resolve 값이 `done` 이벤트와 일치하는지 검증.
- `error` 이벤트 수신 시 reject하는지 검증.
- 스트림이 `done`/`error` 없이 끝나는 경우 reject하는지 검증.
- 기존 400/413 에러 케이스 테스트는 변경 없이 유지(사전 검증 단계는 안 바뀜).

## 범위 밖

- `maxDuration` 타임아웃 자체를 없애는 백그라운드 job 방식은 별도 문서(`docs/specs/import-progress-background-jobs.md`) — 대량 임포트가 실사용에서 반복되면 그때 전환.
- Chrome Extension의 개별 저장 플로우는 이 엔드포인트를 쓰지 않으므로 영향 없음.
