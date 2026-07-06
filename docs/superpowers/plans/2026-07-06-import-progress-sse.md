# 북마크 임포트 SSE 진행률 스트리밍 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 북마크 임포트(`POST /api/bookmarks/import`) 처리 중 항목 단위 진행률을 SSE로 스트리밍하고, 프론트 `/import` 페이지에 실시간 프로그레스바를 표시한다.

**Architecture:** 파일 검증(400/413)과 빈 파싱(0건) 경로는 기존처럼 즉시 JSON 응답. 실제 처리 단계(중복분류→folder_hint 갱신→AI태깅/임베딩/저장)는 `ReadableStream`으로 감싸 각 항목이 종결 처리되는 즉시(청크 전체를 기다리지 않고) `progress` 이벤트를 전송, 마지막에 `done` 이벤트로 최종 결과 전달. 프론트는 `fetch().body`를 직접 읽어 SSE 파싱하고, `useMutation`의 `mutationFn` 안에서 `onProgress` 콜백으로 진행률을 컴포넌트 로컬 상태에 반영한다.

**Tech Stack:** Next.js Route Handler(Web Streams API), TanStack Query, Vitest.

**설계 문서:** `docs/superpowers/specs/2026-07-06-import-progress-sse-design.md`

---

## Task 1: 백엔드 — route.ts SSE 스트리밍 전환

**Files:**
- Modify: `front/app/api/bookmarks/import/route.ts` (POST 핸들러 전체 재작성)
- Modify: `front/app/api/bookmarks/import/__tests__/route.test.ts` (스트림 파싱 헬퍼 추가 + 기존 24개 테스트 전환 + 신규 3개 테스트)

이 태스크는 헬퍼 함수(`dedupeBatch`, `fetchExistingByUrl`, `foldersEqual`, `CandidateBookmark` 타입)는 그대로 두고 `POST` 핸들러 본문만 스트리밍 구조로 바꾼다.

### 배경 지식 (구현 전 반드시 이해)

현재 `POST`는 모든 처리를 `await`로 끝낸 뒤 `NextResponse.json(...)`을 반환한다. SSE로 바꾸면 `POST`는 `new Response(stream, {...})`를 **즉시** 반환하고, 실제 처리는 `ReadableStream`의 `start(controller)` 콜백 안에서 계속된다. 이 때문에 테스트에서 `await POST(request)`가 반환되는 시점과 실제 처리가 끝나는 시점이 분리된다 — **테스트는 반드시 응답 스트림을 끝까지 읽어야(drain) 처리 완료를 보장할 수 있다.** 스트림을 읽지 않고 다음 테스트로 넘어가면 이전 테스트의 백그라운드 처리가 다음 테스트의 목(mock) 상태를 오염시켜 flaky 테스트가 된다 — 그래서 아래 신규 테스트 파일에서는 실제 처리가 일어나는 모든 테스트가 예외 없이 스트림을 끝까지 읽는다.

### Step 1: 스트림 파싱 테스트 헬퍼 + 타입 추가

`front/app/api/bookmarks/import/__tests__/route.test.ts` 상단, `makeReq` 헬퍼 정의 바로 다음에 추가:

```ts
// ------ SSE 스트림 파싱 헬퍼 ------

interface ProgressEvent {
  type: 'progress'
  total: number
  done: number
  imported: number
  duplicate: number
  failed: number
  skipped: number
}
interface DoneEvent {
  type: 'done'
  imported: number
  failed: number
  skipped: number
  duplicate: number
}
interface ErrorEvent {
  type: 'error'
  message: string
}
type StreamEvent = ProgressEvent | DoneEvent | ErrorEvent

// 응답 스트림을 끝까지 읽어 SSE data: 라인들을 파싱 — 처리 완료를 보장하기 위해
// 실제 처리가 일어나는 모든 테스트는 이 함수로 스트림을 반드시 drain해야 한다.
async function readAllEvents(res: Response): Promise<StreamEvent[]> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const events: StreamEvent[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sepIndex: number
    while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
      const line = buffer.slice(0, sepIndex)
      buffer = buffer.slice(sepIndex + 2)
      if (!line.startsWith('data: ')) continue
      events.push(JSON.parse(line.slice(6)) as StreamEvent)
    }
  }
  return events
}

function readFinalResult(events: StreamEvent[]): DoneEvent {
  const doneEvent = events.find((e): e is DoneEvent => e.type === 'done')
  if (!doneEvent) throw new Error('done 이벤트 없음 — 테스트 목 설정을 확인하세요')
  return doneEvent
}
```

### Step 2: mock에 `existingLookupShouldThrow` 스위치 추가

기존 `let existingLookupFailForUrl: string | null = null` 다음 줄에 추가:

```ts
// 최상위 예외(error 이벤트) 테스트용 — in() 호출 자체가 throw
let existingLookupShouldThrow = false
```

`makeSupabase`의 `in()` 구현 맨 앞에 체크 추가 (기존 `if (existingLookupShouldError) {...}` 앞):

```ts
async in(_col: string, urls: string[]) {
  if (existingLookupShouldThrow) {
    throw new Error('boom')
  }
  if (existingLookupShouldError) {
    return { data: null, error: { message: 'lookup failed' } }
  }
  // ...이하 기존 그대로
```

`beforeEach` 블록에 리셋 추가 (기존 `existingLookupFailForUrl = null` 다음 줄):

```ts
existingLookupShouldThrow = false
```

### Step 3: 기존 24개 테스트를 스트림 drain 방식으로 전환

아래는 `describe('POST /api/bookmarks/import', ...)` 블록 전체를 **그대로 교체**하는 최종 버전이다(Step 1~2에서 추가한 헬퍼/mock 스위치는 이미 반영된 상태로 가정, 그 위에 이 블록을 붙여넣는다):

```ts
describe('POST /api/bookmarks/import', () => {
  beforeEach(() => {
    currentUser = { id: 'u1' }
    insertSpy.mockReset()
    updateSpy.mockReset()
    generateTags.mockReset()
    createEmbedding.mockReset()
    fetchMeta.mockReset()
    existingRows = []
    existingLookupShouldError = false
    updateShouldError = false
    existingLookupFailForUrl = null
    existingLookupShouldThrow = false
    generateTags.mockResolvedValue(['개발', '프론트엔드'])
    createEmbedding.mockResolvedValue([0.1, 0.2])
    fetchMeta.mockResolvedValue({ title: '', description: '' })
  })

  it('정상 임포트 — 200 + imported 카운트 + folder_hint 보존', async () => {
    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    expect(res.status).toBe(200)

    const events = await readAllEvents(res)
    const json = readFinalResult(events)
    expect(json.imported).toBe(2)
    expect(json.failed).toBe(0)

    const calls: Array<Array<Record<string, unknown>>> = insertSpy.mock.calls
    const nextjsInsert = calls.find((c) => c[0].url === 'https://nextjs.org/')
    expect(nextjsInsert?.[0].folder_hint).toEqual(['개발'])

    const exampleInsert = calls.find((c) => c[0].url === 'https://example.com/')
    expect(exampleInsert?.[0].folder_hint).toBeNull()
  })

  it('A52: fetchMeta description을 태깅·임베딩 입력으로 전달', async () => {
    fetchMeta.mockResolvedValue({ title: 'meta title', description: 'Next.js 서버 컴포넌트 가이드' })

    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    await readAllEvents(res)

    expect(generateTags).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Next.js 서버 컴포넌트 가이드' }),
    )
    expect(createEmbedding).toHaveBeenCalledWith(
      expect.stringContaining('Next.js 서버 컴포넌트 가이드'),
    )
  })

  it('A52: fetchMeta 빈 description → title 폴백 (description 미전달)', async () => {
    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    await readAllEvents(res)

    expect(generateTags).toHaveBeenCalledWith(
      expect.objectContaining({ description: undefined }),
    )
    expect(createEmbedding).toHaveBeenCalledWith('Next.js')
  })

  it('insert payload에 user_id 포함', async () => {
    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    await readAllEvents(res)
    const calls: Array<Array<Record<string, unknown>>> = insertSpy.mock.calls
    calls.forEach((call) => {
      expect(call[0].user_id).toBe('u1')
    })
  })

  it('파일 없음 → 400', async () => {
    const res = await POST(makeReq())
    expect(res.status).toBe(400)
  })

  it('빈 HTML (파싱 0건) → { imported:0, failed:0, skipped:0, duplicate:0 } (스트림 아닌 즉시 JSON)', async () => {
    const res = await POST(makeReq(makeFile('<html><body>no bookmarks</body></html>')))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ imported: 0, failed: 0, skipped: 0, duplicate: 0 })
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('javascript: URL 스킵 — insert에 포함 안 됨', async () => {
    const html = `<DL><p>
      <DT><A HREF="javascript:void(0)">JS Link</A>
      <DT><A HREF="https://valid.com">Valid</A>
    </DL><p>`
    const res = await POST(makeReq(makeFile(html)))
    const events = await readAllEvents(res)
    const json = readFinalResult(events)
    expect(json.imported).toBe(1)
    expect(insertSpy).toHaveBeenCalledTimes(1)
    expect(insertSpy.mock.calls[0][0].url).toBe('https://valid.com/')
  })

  it('미인증 → 401', async () => {
    currentUser = null
    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    expect(res.status).toBe(401)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('일부 항목 임베딩 실패 → 부분 성공 (failed 카운트, 전체 중단 안 함)', async () => {
    createEmbedding
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValueOnce([0.1, 0.2])

    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    expect(res.status).toBe(200)
    const events = await readAllEvents(res)
    const json = readFinalResult(events)
    expect(json.failed).toBe(1)
    expect(json.imported).toBe(1)
  })

  it('응답에 embedding 미포함', async () => {
    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    const events = await readAllEvents(res)
    const json = readFinalResult(events)
    expect(json).not.toHaveProperty('embedding')
    expect(JSON.stringify(events)).not.toContain('embedding')
  })

  it('처리량 상한 초과(501개) → skipped:1 보고, imported+failed==500', async () => {
    const links = Array.from(
      { length: 501 },
      (_, i) => `<DT><A HREF="https://example.com/${i}">BM ${i}</A>`,
    ).join('\n')
    const html = `<DL><p>\n${links}\n</DL><p>`

    const res = await POST(makeReq(makeFile(html)))
    expect(res.status).toBe(200)
    const events = await readAllEvents(res)
    const json = readFinalResult(events)
    expect(json.skipped).toBe(1)
    expect(json.imported + json.failed).toBe(500)
  }, 15000)

  it('5MB 초과 파일 → 413', async () => {
    const bigContent = 'x'.repeat(5 * 1024 * 1024 + 1)
    const res = await POST(makeReq(makeFile(bigContent)))
    expect(res.status).toBe(413)
  })

  it('HTML 아닌 MIME 타입(text/plain) → 400', async () => {
    const txtFile = new File(['<DL><p><DT><A HREF="https://a.com">A</A></DL>'], 'bm.txt', {
      type: 'text/plain',
    })
    const res = await POST(makeReq(txtFile))
    expect(res.status).toBe(400)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('확장자 .html이면 MIME text/plain이어도 400 아님 (확장자 우선)', async () => {
    const file = new File([SAMPLE_HTML], 'bookmarks.html', { type: 'text/plain' })
    const res = await POST(makeReq(file))
    expect(res.status).toBe(200)
    await readAllEvents(res) // 처리 완료 대기 — 다음 테스트 목 상태 오염 방지
  })

  it('DB 기존 URL 재업로드(폴더 경로 동일) → 완전 스킵, duplicate 카운트', async () => {
    existingRows = [{ url: 'https://nextjs.org/', folder_hint: ['개발'] }]

    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    const events = await readAllEvents(res)
    const json = readFinalResult(events)

    expect(json.duplicate).toBe(1)
    expect(json.imported).toBe(1)
    expect(generateTags).toHaveBeenCalledTimes(1)
    expect(updateSpy).not.toHaveBeenCalled()

    const calls: Array<Array<Record<string, unknown>>> = insertSpy.mock.calls
    expect(calls.some((c) => c[0].url === 'https://nextjs.org/')).toBe(false)
  })

  it('DB 기존 URL, folder_hint 다름 → update만 호출, AI 호출 없음, duplicate 카운트', async () => {
    existingRows = [{ url: 'https://nextjs.org/', folder_hint: ['옛폴더'] }]

    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    const events = await readAllEvents(res)
    const json = readFinalResult(events)

    expect(json.duplicate).toBe(1)
    expect(updateSpy).toHaveBeenCalledWith({ folder_hint: ['개발'] })
    expect(generateTags).toHaveBeenCalledTimes(1)
  })

  it('배치 내부 동일 URL, 폴더 경로 다름 → 마지막 등장 채택, 1회만 upsert, duplicate 카운트', async () => {
    const res = await POST(makeReq(makeFile(DUPLICATE_DIFFERENT_FOLDER_HTML)))
    const events = await readAllEvents(res)
    const json = readFinalResult(events)

    expect(json.duplicate).toBe(1)
    expect(insertSpy).toHaveBeenCalledTimes(1)
    expect(insertSpy.mock.calls[0][0].folder_hint).toEqual(['폴더B'])
  })

  it('배치 내부 동일 URL, 폴더 경로 같음 → 1회만 upsert, duplicate 카운트', async () => {
    const res = await POST(makeReq(makeFile(DUPLICATE_SAME_FOLDER_HTML)))
    const events = await readAllEvents(res)
    const json = readFinalResult(events)

    expect(json.duplicate).toBe(1)
    expect(insertSpy).toHaveBeenCalledTimes(1)
  })

  it('기존 URL 조회(select().eq().in()) 에러 → fail-open으로 정상 처리', async () => {
    existingLookupShouldError = true

    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    expect(res.status).toBe(200)
    const events = await readAllEvents(res)
    const json = readFinalResult(events)

    expect(json.imported).toBe(2)
    expect(json.duplicate).toBe(0)
  })

  it('기존 URL 조회 250건(2청크) 중 1개 청크만 에러 → 실패 청크는 fail-open으로 신규 처리, 성공 청크는 정상 중복 판정', async () => {
    const links = Array.from(
      { length: 250 },
      (_, i) => `<DT><A HREF="https://example.com/${i}">BM ${i}</A>`,
    ).join('\n')
    const html = `<DL><p>\n${links}\n</DL><p>`

    existingRows = [{ url: 'https://example.com/0', folder_hint: null }]
    existingLookupFailForUrl = 'https://example.com/200'

    const res = await POST(makeReq(makeFile(html)))
    expect(res.status).toBe(200)
    const events = await readAllEvents(res)
    const json = readFinalResult(events)

    expect(json.duplicate).toBe(1)
    expect(json.imported).toBe(249)

    const calls: Array<Array<Record<string, unknown>>> = insertSpy.mock.calls
    expect(calls.some((c) => c[0].url === 'https://example.com/0')).toBe(false)
    expect(calls.some((c) => c[0].url === 'https://example.com/200')).toBe(true)
  }, 15000)

  it('folder_hint update 에러 → fail-open, duplicate만 집계 (failed 증가 안 함)', async () => {
    existingRows = [{ url: 'https://nextjs.org/', folder_hint: ['옛폴더'] }]
    updateShouldError = true

    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    expect(res.status).toBe(200)
    const events = await readAllEvents(res)
    const json = readFinalResult(events)

    expect(json.duplicate).toBe(1)
    expect(json.failed).toBe(0)
  })

  it('배치 내부 중복(폴더 다름) + DB 기존 존재(제3 폴더) 복합 → duplicate 2회 집계, 마지막 등장 folder_hint로 update, AI/upsert 없음', async () => {
    existingRows = [{ url: 'https://combo.com/', folder_hint: ['옛폴더'] }]

    const res = await POST(makeReq(makeFile(COMBINED_DUPLICATE_HTML)))
    expect(res.status).toBe(200)
    const events = await readAllEvents(res)
    const json = readFinalResult(events)

    expect(json.duplicate).toBe(2)
    expect(json.imported).toBe(0)
    expect(json.failed).toBe(0)

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith({ folder_hint: ['폴더C'] })

    expect(generateTags).not.toHaveBeenCalled()
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('다단계 folder_hint(2단계) 비교 — 두 번째 레벨만 달라도 update 호출, 정확한 새 배열 전달', async () => {
    existingRows = [{ url: 'https://nested.com/', folder_hint: ['개발', '백엔드'] }]

    const res = await POST(makeReq(makeFile(NESTED_FOLDER_HTML)))
    const events = await readAllEvents(res)
    const json = readFinalResult(events)

    expect(json.duplicate).toBe(1)
    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith({ folder_hint: ['개발', '프론트엔드'] })
    expect(generateTags).not.toHaveBeenCalled()
  })

  it('다단계 folder_hint(2단계) 완전 일치 → 완전 스킵, update 호출 없음', async () => {
    existingRows = [{ url: 'https://nested.com/', folder_hint: ['개발', '프론트엔드'] }]

    const res = await POST(makeReq(makeFile(NESTED_FOLDER_HTML)))
    const events = await readAllEvents(res)
    const json = readFinalResult(events)

    expect(json.duplicate).toBe(1)
    expect(json.imported).toBe(0)
    expect(updateSpy).not.toHaveBeenCalled()
    expect(generateTags).not.toHaveBeenCalled()
  })

  // ------ SSE progress 이벤트 신규 테스트 ------

  it('progress 이벤트 — 항목 수만큼 발생, done 누적값 단조증가, 마지막 이벤트 done===total', async () => {
    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    const events = await readAllEvents(res)
    const progressEvents = events.filter((e): e is ProgressEvent => e.type === 'progress')

    // SAMPLE_HTML은 신규 URL 2건 — 각 항목 종결마다 이벤트 1건씩, 총 2건
    expect(progressEvents).toHaveLength(2)

    for (let i = 1; i < progressEvents.length; i++) {
      expect(progressEvents[i].done).toBeGreaterThan(progressEvents[i - 1].done)
    }

    const last = progressEvents[progressEvents.length - 1]
    expect(last.done).toBe(last.total)
    expect(last.total).toBe(2)
  })

  it('progress 이벤트 — 완전 스킵 중복 항목도 즉시 이벤트 발생(AI 호출 없이도 진행률 반영)', async () => {
    existingRows = [{ url: 'https://nextjs.org/', folder_hint: ['개발'] }]
    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    const events = await readAllEvents(res)
    const progressEvents = events.filter((e): e is ProgressEvent => e.type === 'progress')

    // nextjs.org(완전 스킵) + example.com(신규 처리) = 2건의 progress 이벤트
    expect(progressEvents).toHaveLength(2)
    const finalProgress = progressEvents[progressEvents.length - 1]
    expect(finalProgress.done).toBe(2)
    expect(finalProgress.total).toBe(2)
    expect(finalProgress.duplicate).toBe(1)
    expect(finalProgress.imported).toBe(1)
  })

  it('스트림 처리 중 예상 못한 예외 → error 이벤트 전송 후 종료 (done 이벤트 없음)', async () => {
    existingLookupShouldThrow = true

    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    expect(res.status).toBe(200) // 스트림 자체는 정상 시작 — 에러는 이벤트로 전달됨
    const events = await readAllEvents(res)

    const errorEvent = events.find((e): e is ErrorEvent => e.type === 'error')
    expect(errorEvent).toBeDefined()
    expect(errorEvent?.message).toBe('boom')

    const doneEvent = events.find((e) => e.type === 'done')
    expect(doneEvent).toBeUndefined()
  })
})
```

- [ ] **Step 3a: 위 3개 코드 블록(헬퍼, mock 스위치, describe 블록 전체)을 파일에 반영**

- [ ] **Step 4: 테스트 실행 — RED 확인**

Run: `cd front && npx vitest run app/api/bookmarks/import/__tests__/route.test.ts`
Expected: `readAllEvents`/`readFinalResult` 관련 테스트 다수 FAIL — 현재 `route.ts`는 여전히 `NextResponse.json(...)`을 반환하므로 `res.body`가 Web ReadableStream이 아니거나(`NextResponse.json`도 내부적으로 body를 스트림으로 노출하긴 하지만 `data:` 형식이 아니므로 파싱 실패), `type:'progress'`/`type:'done'` 이벤트 자체가 없어 `readFinalResult`가 `throw`. 신규 progress/error 테스트도 FAIL.

### Step 5: `front/app/api/bookmarks/import/route.ts`의 `POST` 핸들러를 아래로 교체

파일 상단 import·상수·`fileSchema`·`CandidateBookmark`·`dedupeBatch`·`fetchExistingByUrl`·`foldersEqual`는 **그대로 유지**. 그 아래 `export const POST = withAuth(...)` 전체만 아래로 교체:

```ts
// FormData 'file' 필드로 Netscape 북마크 HTML을 받아 배치 저장.
// A52: 각 URL을 fetchMeta로 조회해 description 확보 → 태깅·임베딩 입력 보강.
//      description은 태깅/임베딩 스코프 내에서만 사용 후 파기 — DB 저장·로그 금지(프라이버시).
// 중복 URL(DB 기존·배치 내부)은 AI 호출 전에 걸러냄 — 완전 스킵하거나 folder_hint만 갱신.
// 파일 검증(400/413)과 빈 파싱(0건) 경로는 즉시 JSON 응답. 실제 처리 단계는 SSE 스트림으로
// 항목이 종결 처리될 때마다 progress 이벤트 전송, 마지막에 done 이벤트로 최종 결과 전달.
// progress/done 이벤트 모두 embedding/content/description 절대 미포함.
export const POST = withAuth(async (req, { user, supabase }) => {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: '파일 업로드 파싱 실패' }, { status: 400 })
  }

  // Zod safeParse: 파일 존재 여부 + MIME/확장자 검증 → 400
  const parsed = fileSchema.safeParse({ file: formData.get('file') })
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }
  const file = parsed.data.file

  // 크기 초과는 HTTP 의미론적으로 413 (Zod와 별도 처리)
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: '파일 크기가 5MB를 초과합니다' },
      { status: 413 },
    )
  }

  const html = await file.text()
  const allBookmarks = parseNetscapeBookmarks(html)

  // 0건은 처리할 것도, 스트리밍할 것도 없으므로 즉시 JSON 응답 (스트림 진입 안 함)
  if (allBookmarks.length === 0) {
    return NextResponse.json({ imported: 0, failed: 0, skipped: 0, duplicate: 0 })
  }

  // 상한 초과분은 잘라내고 skipped 카운트로 보고
  const skipped = Math.max(0, allBookmarks.length - MAX_ITEMS)
  const items = allBookmarks.slice(0, MAX_ITEMS)

  // 배치 내부 중복 제거 (마지막 등장의 folder_hint 채택) — 스트림 진입 전 동기 계산
  const { candidates, duplicate: batchDuplicate } = dedupeBatch(items)
  const total = candidates.size

  const encoder = new TextEncoder()
  function send(controller: ReadableStreamDefaultController, event: Record<string, unknown>) {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
  }

  const stream = new ReadableStream({
    async start(controller) {
      let duplicate = batchDuplicate
      let imported = 0
      let failed = 0
      let done = 0

      try {
        // 기존 저장된 URL 배치 조회 — AI 호출 전 사전 필터링
        const existingByUrl = await fetchExistingByUrl(supabase, user.id, [...candidates.keys()])

        // 신규 처리 대상과 folder_hint만 갱신할 대상을 먼저 동기적으로 분류(await 없음) —
        // toProcess는 원본 순서를 그대로 보존해야 하므로(임베딩 실패 순서 테스트 등) 비동기 fan-out 이전에 확정한다.
        const toProcess: CandidateBookmark[] = []
        const needsFolderUpdate: Array<{ url: string; newFolderHint: string[] | null }> = []

        for (const item of candidates.values()) {
          if (!existingByUrl.has(item.url)) {
            toProcess.push(item)
            continue
          }

          // 이미 DB에 존재 — folder_hint 비교 후 완전 스킵 또는 folder_hint만 갱신
          duplicate++
          const existingFolderHint = existingByUrl.get(item.url) ?? null
          const newFolderHint = item.folder_hint.length > 0 ? item.folder_hint : null
          if (foldersEqual(existingFolderHint, newFolderHint)) {
            // 네트워크 작업 없이 즉시 종결 — progress 이벤트도 즉시 전송
            done++
            send(controller, { type: 'progress', total, done, imported, duplicate, failed, skipped })
            continue
          }

          needsFolderUpdate.push({ url: item.url, newFolderHint })
        }

        // FOLDER_UPDATE_CHUNK개씩 청크로 나눠 처리 — 최대 500건이 한꺼번에 몰려도
        // update() 커넥션이 무제한 fan-out 되지 않도록 방어(AI 처리 루프의 CHUNK_SIZE와 동일한 스로틀링 패턴)
        for (let i = 0; i < needsFolderUpdate.length; i += FOLDER_UPDATE_CHUNK) {
          const chunk = needsFolderUpdate.slice(i, i + FOLDER_UPDATE_CHUNK)
          await Promise.all(
            chunk.map(async ({ url, newFolderHint }) => {
              try {
                // supabase-js 쿼리 빌더는 DB 에러를 throw하지 않고 { error } 필드로 resolve한다.
                // 여기서 error를 의도적으로 확인하지 않는 것 자체가 fail-open 처리다 — 실패해도
                // duplicate 집계만 유지하고 failed는 증가시키지 않는다. try/catch는 그와 별개로
                // 네트워크 단절 등 실제 예외 상황에 대한 방어선일 뿐이다.
                await supabase
                  .from('bookmarks')
                  .update({ folder_hint: newFolderHint })
                  .eq('user_id', user.id)
                  .eq('url', url)
              } catch {
                // 실제 예외(네트워크 등) 방어 — 위 주석 참고, 여기도 failed 증가 안 함
              } finally {
                // 항목 단위 진행률 — 청크(Promise.all) 전체를 기다리지 않고 이 항목이 끝나는 즉시 전송
                done++
                send(controller, { type: 'progress', total, done, imported, duplicate, failed, skipped })
              }
            }),
          )
        }

        // category_id 조회 메모이즈 — 최대 6대분류 고정이므로 N+1 방지
        const categoryCache = new Map<string, string | null>()

        // CHUNK_SIZE개씩 청크로 나눠 처리 — OpenAI rate limit 방어
        for (let i = 0; i < toProcess.length; i += CHUNK_SIZE) {
          const chunk = toProcess.slice(i, i + CHUNK_SIZE)

          await Promise.all(
            chunk.map(async ({ title, url, folder_hint }) => {
              try {
                // A52: URL 메타 조회 → description 확보(태깅 굶김 해소). fetchMeta는 throw 안 함(실패=빈 값),
                // 내부 5s 타임아웃. description은 아래 태깅·임베딩 입력으로만 쓰고 저장·로그하지 않음.
                // ponytail: 항목당 최대 5s(죽은 URL) 추가 — 청크 동시성(CHUNK_SIZE)이 상한. 대량+저속 URL로
                //           maxDuration(300s) 압박 시 백그라운드 큐로 승격(현재는 인라인으로 충분).
                const meta = await fetchMeta(url)
                const description = meta.description || undefined

                const [tagsResult, embeddingResult] = await Promise.allSettled([
                  generateTags({ title, url, description }),
                  createEmbedding(description ? `${title}\n${description}` : title),
                ])

                // 임베딩 실패 → 검색 불가 북마크 → 해당 항목만 실패 처리, 전체 중단 금지
                if (embeddingResult.status === 'rejected') {
                  failed++
                  return
                }

                const embedding = embeddingResult.value
                // 태깅 실패는 빈 태그로 degrade.
                // A5(단건)와 달리 임포트는 임베딩 실패 시에도 전체 중단하지 않고 해당 항목만 실패 처리.
                const rawTags = tagsResult.status === 'fulfilled' ? tagsResult.value : []
                const { category: top, midTags: tags } = extractTopCategory(normalizeTags(rawTags))
                let category_id: string | null = null
                if (top) {
                  if (categoryCache.has(top)) {
                    category_id = categoryCache.get(top)!
                  } else {
                    // 유저 카테고리 upsert (없으면 생성, 있으면 id만 반환)
                    const { data: category } = await supabase
                      .from('categories')
                      .upsert({ name: top, user_id: user.id }, { onConflict: 'user_id,name' })
                      .select('id')
                      .single()
                    category_id = category?.id ?? null
                    categoryCache.set(top, category_id)
                  }
                }

                // upsert — (user_id, url) unique 제약(A35). 사전 dedup을 통과한 URL만 여기 도달하므로
                // 정상 경로에선 충돌이 없고, ignoreDuplicates:true는 동시 요청 경합 시 마지막 방어선
                // (경합 시 조용히 무시 — 기존 데이터 덮어쓰지 않음, "완전 스킵" 원칙과 일치).
                const { error } = await supabase.from('bookmarks').upsert(
                  {
                    user_id: user.id,
                    title,
                    url,
                    tags,
                    category_id,
                    // 루트 항목(빈 배열)은 null 저장 — A5 패턴과 통일
                    folder_hint: folder_hint.length > 0 ? folder_hint : null,
                    embedding,
                  },
                  { onConflict: 'user_id, url', ignoreDuplicates: true },
                )

                if (error) {
                  failed++
                } else {
                  imported++
                }
              } catch {
                // 개별 항목 예외 → 실패 카운트만 증가, 전체 배치 계속
                failed++
              } finally {
                // 항목 단위 진행률 — 청크 전체를 기다리지 않고 이 항목이 끝나는 즉시 전송
                done++
                send(controller, { type: 'progress', total, done, imported, duplicate, failed, skipped })
              }
            }),
          )
        }

        send(controller, { type: 'done', imported, failed, skipped, duplicate })
        controller.close()
      } catch (err) {
        // 스트림 처리 중 예상 못한 예외 — error 이벤트로 명시 전달 후 종료(무한 대기 방지)
        send(controller, {
          type: 'error',
          message: err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.',
        })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
})
```

- [ ] **Step 6: 테스트 재실행 — GREEN 확인**

Run: `cd front && npx vitest run app/api/bookmarks/import/__tests__/route.test.ts`
Expected: 전체 27개 테스트(기존 24 + 신규 3) PASS

- [ ] **Step 7: Commit**

```bash
git add front/app/api/bookmarks/import/route.ts front/app/api/bookmarks/import/__tests__/route.test.ts
git commit -m "$(cat <<'EOF'
feat(import): 임포트 처리 진행률 SSE 스트리밍

파일 검증·빈 파싱 경로는 기존 JSON 응답 유지, 실제 처리 단계는
항목 단위 progress 이벤트를 스트리밍하고 done/error 이벤트로 종결.
EOF
)"
```

---

## Task 2: 프론트 훅 — SSE 스트림 파싱 (`useImportBookmarks.ts`)

**Files:**
- Modify: `front/hooks/useImportBookmarks.ts`
- Modify: `front/hooks/__tests__/useImportBookmarks.test.ts`

### Step 1: 스트림 mock 헬퍼 추가

`front/hooks/__tests__/useImportBookmarks.test.ts` 최상단 import 아래에 추가:

```ts
// SSE 이벤트 배열을 fetch 응답의 body(ReadableStream 유사 객체)로 변환 — 테스트용
function makeSSEBody(events: Array<Record<string, unknown>>) {
  const chunks = events.map((e) => `data: ${JSON.stringify(e)}\n\n`)
  const encoder = new TextEncoder()
  let i = 0
  return {
    getReader: () => ({
      read: async () => {
        if (i >= chunks.length) return { done: true, value: undefined }
        const value = encoder.encode(chunks[i])
        i++
        return { done: false, value }
      },
    }),
  }
}
```

### Step 2: 기존 `fetchImportBookmarks` 테스트 3개를 스트림 mock으로 전환

`describe('fetchImportBookmarks', ...)` 블록 안의 아래 3개 테스트를 교체:

```ts
// 변경 전 (34~49번째 줄)
it('POST /api/bookmarks/import 를 FormData body로 호출', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ imported: 3, failed: 0, skipped: 1 }),
  })
  // ...
```

```ts
// 변경 후
it('POST /api/bookmarks/import 를 FormData body로 호출', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    body: makeSSEBody([{ type: 'done', imported: 3, failed: 0, skipped: 1, duplicate: 0 }]),
  })

  const formData = new FormData()
  formData.append('file', new Blob(['<html>'], { type: 'text/html' }), 'bookmarks.html')

  await fetchImportBookmarks(formData)

  expect(fetch).toHaveBeenCalledWith('/api/bookmarks/import', {
    method: 'POST',
    body: formData,
  })
})
```

```ts
// 변경 전 (51~64번째 줄)
it('Content-Type 헤더를 수동 설정하지 않음 (브라우저가 자동 설정)', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ imported: 1, failed: 0, skipped: 0 }),
  })
  // ...
```

```ts
// 변경 후
it('Content-Type 헤더를 수동 설정하지 않음 (브라우저가 자동 설정)', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    body: makeSSEBody([{ type: 'done', imported: 1, failed: 0, skipped: 0, duplicate: 0 }]),
  })

  const formData = new FormData()
  await fetchImportBookmarks(formData)

  const callArgs = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
  const headers = callArgs.headers as Record<string, string> | undefined
  expect(headers?.['Content-Type']).toBeUndefined()
})
```

```ts
// 변경 전 (66~75번째 줄)
it('성공 응답: { imported, failed, skipped } 반환', async () => {
  const expected = { imported: 5, failed: 2, skipped: 1 }
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => expected,
  })

  const result = await fetchImportBookmarks(new FormData())
  expect(result).toEqual(expected)
})
```

```ts
// 변경 후
it('성공 응답: done 이벤트 값을 ImportResult로 반환', async () => {
  const expected = { imported: 5, failed: 2, skipped: 1, duplicate: 3 }
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    body: makeSSEBody([{ type: 'done', ...expected }]),
  })

  const result = await fetchImportBookmarks(new FormData())
  expect(result).toEqual(expected)
})
```

400/413/500 에러 응답 테스트 4개(77~127번째 줄)는 **변경 없음** — 사전 검증 실패는 여전히 일반 JSON 에러 응답이라 `json: async () => (...)` mock 그대로 유효.

### Step 3: progress/error/조기종료 신규 테스트 3개 추가

`describe('fetchImportBookmarks', ...)` 블록의 마지막 테스트(500 응답 JSON 파싱 실패) 다음, 블록 닫는 `})` 직전에 추가:

```ts
  it('progress 이벤트마다 onProgress 콜백 호출, 최종 resolve 값은 done 이벤트', async () => {
    const progressEvents = [
      { type: 'progress', total: 2, done: 1, imported: 1, duplicate: 0, failed: 0, skipped: 0 },
      { type: 'progress', total: 2, done: 2, imported: 2, duplicate: 0, failed: 0, skipped: 0 },
    ]
    const doneEvent = { type: 'done', imported: 2, failed: 0, skipped: 0, duplicate: 0 }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: makeSSEBody([...progressEvents, doneEvent]),
    })

    const onProgress = vi.fn()
    const result = await fetchImportBookmarks(new FormData(), onProgress)

    expect(onProgress).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenNthCalledWith(1, progressEvents[0])
    expect(onProgress).toHaveBeenNthCalledWith(2, progressEvents[1])
    expect(result).toEqual({ imported: 2, failed: 0, skipped: 0, duplicate: 0 })
  })

  it('error 이벤트 수신 시 해당 메시지로 reject', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: makeSSEBody([{ type: 'error', message: '문제 발생' }]),
    })

    await expect(fetchImportBookmarks(new FormData())).rejects.toThrow('문제 발생')
  })

  it('done/error 이벤트 없이 스트림 종료 → 연결 끊김 에러 throw', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: makeSSEBody([]),
    })

    await expect(fetchImportBookmarks(new FormData())).rejects.toThrow(
      '업로드 중 연결이 끊겼습니다. 다시 시도해주세요.',
    )
  })
```

- [ ] **Step 4: 테스트 실행 — RED 확인**

Run: `cd front && npx vitest run hooks/__tests__/useImportBookmarks.test.ts`
Expected: 전환된 3개 + 신규 3개 테스트 FAIL(`res.body`가 undefined라 `getReader` 호출 시 예외, 혹은 `fetchImportBookmarks`가 여전히 `res.json()`만 호출). 나머지(400/413/500, formatFileSize, onSuccess) 테스트는 계속 PASS.

- [ ] **Step 5: `front/hooks/useImportBookmarks.ts` 전체를 아래로 교체**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'

export interface ImportResult {
  imported: number
  failed: number
  skipped: number
  duplicate: number
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
        const { imported, failed, skipped, duplicate } = event
        return { imported, failed, skipped, duplicate }
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
```

- [ ] **Step 6: 테스트 재실행 — GREEN 확인**

Run: `cd front && npx vitest run hooks/__tests__/useImportBookmarks.test.ts`
Expected: 전체 17개 테스트(기존 14 + 신규 3) PASS

- [ ] **Step 7: Commit**

```bash
git add front/hooks/useImportBookmarks.ts front/hooks/__tests__/useImportBookmarks.test.ts
git commit -m "$(cat <<'EOF'
feat(import): 프론트에서 SSE 진행률 스트림 파싱

fetchImportBookmarks가 응답 body를 직접 읽어 progress/done/error
이벤트를 파싱. onProgress 콜백 추가, mutationFn 입력을
{ formData, onProgress } 형태로 변경.
EOF
)"
```

---

## Task 3: 프론트 UI — 프로그레스바 (`import/page.tsx`)

**Files:**
- Modify: `front/app/(dashboard)/import/page.tsx`

이 페이지는 기존에도 전용 테스트 파일이 없다(프로젝트 컨벤션) — 이 태스크는 구현 후 수동 확인으로 검증한다.

### Step 1: import 및 상태 추가

`front/app/(dashboard)/import/page.tsx` 6번째 줄:

```ts
// 변경 전
import { useImportBookmarks, formatFileSize } from '@/hooks/useImportBookmarks'
```

```ts
// 변경 후
import { useImportBookmarks, formatFileSize, type ImportProgress } from '@/hooks/useImportBookmarks'
```

11~13번째 줄(`useState` 선언부) 다음에 추가:

```ts
const [progress, setProgress] = useState<ImportProgress | null>(null)
```

### Step 2: 파일 재선택/취소/재업로드 시 progress 리셋

`handleFileSelect`(24~38번째 줄) 안 `resetMutation()` 다음 줄에 추가:

```ts
setProgress(null)
```

`handleClearFile`(66~71번째 줄)의 `mutation.reset()` 다음 줄에 추가:

```ts
setProgress(null)
```

`handleReupload`(73~78번째 줄)의 `mutation.reset()` 다음 줄에도 동일하게 추가:

```ts
setProgress(null)
```

### Step 3: `handleUpload`에서 `onProgress` 전달

```ts
// 변경 전 (59~64번째 줄)
const handleUpload = () => {
  if (!file || isUploading) return
  const formData = new FormData()
  formData.append('file', file)
  mutation.mutate(formData)
}
```

```ts
// 변경 후
const handleUpload = () => {
  if (!file || isUploading) return
  const formData = new FormData()
  formData.append('file', file)
  setProgress(null)
  mutation.mutate({ formData, onProgress: setProgress })
}
```

### Step 4: 업로드 버튼 아래 프로그레스바 추가

`{file && !isSuccess && (<button onClick={handleUpload} ...>...업로드...)}` 블록(164~182번째 줄) 바로 다음에 추가:

```tsx
{isUploading && progress && (
  <div className="mt-4">
    <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-[#64748B] dark:text-gray-400">
      <span>처리 중…</span>
      <span className="font-mono">{progress.done} / {progress.total}건</span>
    </div>
    <div className="h-2 w-full overflow-hidden rounded-full bg-[#E2E8F0] dark:bg-gray-800">
      <div
        className="h-full rounded-full gradient-brand transition-all duration-300"
        style={{
          width: `${progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0}%`,
        }}
      />
    </div>
  </div>
)}
```

- [ ] **Step 5: 타입체크**

Run: `cd front && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: 수동 확인 (개발 서버)**

Run: `cd front && npm run dev` (또는 프로젝트 기존 dev 스크립트)

브라우저에서 `/import` 페이지 접속 → 여러 건(10건 이상) 포함된 HTML 북마크 파일 업로드 → 업로드 버튼 클릭 → 프로그레스바가 0%에서 점진적으로 증가해 100%에서 완료 결과 패널로 전환되는지 육안 확인. 완료 후 "다시 업로드" 클릭 시 프로그레스바가 사라지고 초기 상태로 돌아가는지도 확인.

- [ ] **Step 7: Commit**

```bash
git add "front/app/(dashboard)/import/page.tsx"
git commit -m "$(cat <<'EOF'
feat(import): 업로드 진행률 프로그레스바 UI 추가

onProgress 콜백으로 받은 진행률을 done/total 기반 퍼센트 바로 표시.
재업로드·파일 재선택 시 진행률 상태 리셋.
EOF
)"
```

---

## Task 4: 전체 회귀 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: front 전체 테스트 스위트 실행**

Run: `cd front && npx vitest run`
Expected: 전체 테스트 PASS (다른 라우트/훅 영향 없음)

- [ ] **Step 2: 타입체크**

Run: `cd front && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: lint**

Run: `cd front && npx eslint app/api/bookmarks/import/route.ts app/api/bookmarks/import/__tests__/route.test.ts hooks/useImportBookmarks.ts hooks/__tests__/useImportBookmarks.test.ts "app/(dashboard)/import/page.tsx"`
Expected: 에러 없음

이 태스크는 커밋할 코드 변경이 없으므로 커밋 생략. 실패 항목 발견 시 해당 태스크로 돌아가 수정 후 재실행.
