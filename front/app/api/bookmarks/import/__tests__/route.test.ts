import { describe, it, expect, vi, beforeEach } from 'vitest'

// AI 모킹 — 실제 OpenAI 호출 차단
const { generateTags, createEmbedding } = vi.hoisted(() => ({
  generateTags: vi.fn(),
  createEmbedding: vi.fn(),
}))
vi.mock('@/lib/ai', () => ({ generateTags, createEmbedding }))

// A52: 임포트가 fetchMeta로 description 조회 — 실네트워크 차단, 기본 빈 메타 반환
const { fetchMeta } = vi.hoisted(() => ({ fetchMeta: vi.fn() }))
vi.mock('@/lib/fetchMeta', () => ({ fetchMeta }))

// Supabase 모킹: auth + categories 조회 + bookmarks select(중복조회)/upsert/update
const insertSpy = vi.fn() // ponytail: alias kept for backward-compat test assertions
const updateSpy = vi.fn()

// 기존 저장된 URL 목록 — 중복 필터링 테스트에서 시나리오별로 채움
let existingRows: Array<{ url: string; folder_hint: string[] | null }> = []
let existingLookupShouldError = false
let updateShouldError = false
// 멀티 청크(>200 URL) 테스트에서 특정 청크만 실패시키기 위한 스위치 —
// 해당 URL을 포함한 in() 호출만 에러 반환, 다른 청크는 정상 응답(부분 실패 검증용)
let existingLookupFailForUrl: string | null = null
// 최상위 예외(error 이벤트) 테스트용 — in() 호출 자체가 throw
let existingLookupShouldThrow = false
// upsert 에러(DB 저장 실패) 테스트용 — failedItems에 '저장 실패' 고정 문구 매핑 확인
let upsertShouldError = false
// categories upsert 중 예외(그 외 예외 경로) 테스트용 — failedItems에 '처리 중 오류' 고정 문구 매핑 확인
let categoryUpsertShouldThrow = false

function makeSupabase(user: unknown) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from(table: string) {
      if (table === 'categories') {
        return {
          upsert: () => ({
            select: () => ({
              single: async () => {
                if (categoryUpsertShouldThrow) {
                  throw new Error('category upsert boom')
                }
                return { data: { id: 'cat-개발' }, error: null }
              },
            }),
          }),
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { id: 'cat-개발' }, error: null }),
            }),
          }),
        }
      }
      // bookmarks: select(기존 URL+folder_hint 배치 조회) / upsert(신규 저장) / update(folder_hint 갱신)
      return {
        select() {
          return {
            eq() {
              return {
                async in(_col: string, urls: string[]) {
                  if (existingLookupShouldThrow) {
                    throw new Error('boom')
                  }
                  if (existingLookupShouldError) {
                    return { data: null, error: { message: 'lookup failed' } }
                  }
                  if (existingLookupFailForUrl && urls.includes(existingLookupFailForUrl)) {
                    return { data: null, error: { message: 'chunk lookup failed' } }
                  }
                  const matched = existingRows.filter((r) => urls.includes(r.url))
                  return { data: matched, error: null }
                },
              }
            },
          }
        },
        upsert(payload: unknown) {
          insertSpy(payload)
          if (upsertShouldError) return { error: { message: 'db constraint violation xyz' } }
          return { error: null }
        },
        update(payload: unknown) {
          return {
            eq() {
              return {
                async eq() {
                  updateSpy(payload)
                  if (updateShouldError) return { error: { message: 'update failed' } }
                  return { error: null }
                },
              }
            },
          }
        },
      }
    },
  }
}

let currentUser: unknown = { id: 'u1' }
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => makeSupabase(currentUser),
}))

import { POST } from '../route'

// ------ 헬퍼 ------

function makeFile(content: string, name = 'bookmarks.html'): File {
  return new File([content], name, { type: 'text/html' })
}

function makeReq(file?: File): Request {
  const fd = new FormData()
  if (file) fd.append('file', file)
  return new Request('http://t/api/bookmarks/import', {
    method: 'POST',
    body: fd,
  })
}

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
  failedItems: Array<{ url: string; reason: string }>
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

// 폴더 1단계 + 북마크 2개
const SAMPLE_HTML = `<DL><p>
  <DT><H3 ADD_DATE="1">개발</H3>
  <DL><p>
    <DT><A HREF="https://nextjs.org" ADD_DATE="2">Next.js</A>
  </DL><p>
  <DT><A HREF="https://example.com" ADD_DATE="3">Example</A>
</DL><p>`

// 동일 URL이 서로 다른 폴더에 2번 등장 — 배치 내부 중복(폴더 다름) 테스트용
const DUPLICATE_DIFFERENT_FOLDER_HTML = `<DL><p>
  <DT><H3>폴더A</H3>
  <DL><p>
    <DT><A HREF="https://dup.com">Dup A</A>
  </DL><p>
  <DT><H3>폴더B</H3>
  <DL><p>
    <DT><A HREF="https://dup.com">Dup B</A>
  </DL><p>
</DL><p>`

// 동일 URL이 같은 폴더에 2번 등장 — 배치 내부 중복(폴더 같음) 테스트용
const DUPLICATE_SAME_FOLDER_HTML = `<DL><p>
  <DT><H3>폴더A</H3>
  <DL><p>
    <DT><A HREF="https://dup.com">Dup A</A>
    <DT><A HREF="https://dup.com">Dup A2</A>
  </DL><p>
</DL><p>`

// 동일 URL이 서로 다른 폴더에 2번 등장(배치 내부 중복) + DB에도 이미 존재(제3의 폴더) —
// 배치 내부 dedup·DB 매치 복합 케이스 테스트용
const COMBINED_DUPLICATE_HTML = `<DL><p>
  <DT><H3>폴더A</H3>
  <DL><p>
    <DT><A HREF="https://combo.com">Combo A</A>
  </DL><p>
  <DT><H3>폴더C</H3>
  <DL><p>
    <DT><A HREF="https://combo.com">Combo C</A>
  </DL><p>
</DL><p>`

// 2단계 중첩 폴더(개발 > 프론트엔드) — 다단계 folder_hint 비교 테스트용
const NESTED_FOLDER_HTML = `<DL><p>
  <DT><H3>개발</H3>
  <DL><p>
    <DT><H3>프론트엔드</H3>
    <DL><p>
      <DT><A HREF="https://nested.com">Nested</A>
    </DL><p>
  </DL><p>
</DL><p>`

// ------ 테스트 ------

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
    upsertShouldError = false
    categoryUpsertShouldThrow = false
    generateTags.mockResolvedValue(['개발', '프론트엔드'])
    createEmbedding.mockResolvedValue([0.1, 0.2])
    fetchMeta.mockResolvedValue({ title: '', description: '', content: '' })
  })

  it('정상 임포트 — 200 + imported 카운트 + folder_hint 보존', async () => {
    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    expect(res.status).toBe(200)

    const events = await readAllEvents(res)
    const json = readFinalResult(events)
    expect(json.imported).toBe(2)
    expect(json.failed).toBe(0)

    // folder_hint 보존 확인 (url은 normalizeUrl로 canonical 형태 — 루트 slash 포함)
    const calls: Array<Array<Record<string, unknown>>> = insertSpy.mock.calls
    const nextjsInsert = calls.find((c) => c[0].url === 'https://nextjs.org/')
    expect(nextjsInsert?.[0].folder_hint).toEqual(['개발'])

    // 루트 항목은 null 저장
    const exampleInsert = calls.find((c) => c[0].url === 'https://example.com/')
    expect(exampleInsert?.[0].folder_hint).toBeNull()
  })

  it('A52: fetchMeta content를 태깅·임베딩 입력으로 전달', async () => {
    fetchMeta.mockResolvedValue({
      title: 'meta title',
      description: '짧은 요약',
      content: 'Next.js 서버 컴포넌트 가이드 본문',
    })

    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    await readAllEvents(res)

    // 태깅에 content 전달 (title+url 굶김 해소) — generateTags 파라미터명은 description이지만
    // 실제로는 embedding용 content를 받는다(내부 인터페이스 명명, 외부 의미와 무관).
    expect(generateTags).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Next.js 서버 컴포넌트 가이드 본문' }),
    )
    // 임베딩도 title+content 결합 (약한 벡터 개선)
    expect(createEmbedding).toHaveBeenCalledWith(
      expect.stringContaining('Next.js 서버 컴포넌트 가이드 본문'),
    )
  })

  it('description은 embedding 입력과 별개로 upsert payload에 저장됨', async () => {
    fetchMeta.mockResolvedValue({
      title: '',
      description: '카드용 요약',
      content: '임베딩용 본문',
    })

    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    await readAllEvents(res)

    const calls: Array<Array<Record<string, unknown>>> = insertSpy.mock.calls
    calls.forEach((call) => {
      expect(call[0].description).toBe('카드용 요약')
    })
  })

  it('fetchMeta thumbnailUrl이 upsert payload의 thumbnail_url로 저장됨', async () => {
    fetchMeta.mockResolvedValue({
      title: '',
      description: '',
      content: '',
      thumbnailUrl: 'https://cdn.example.com/thumb.png',
    })

    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    await readAllEvents(res)

    const calls: Array<Array<Record<string, unknown>>> = insertSpy.mock.calls
    calls.forEach((call) => {
      expect(call[0].thumbnail_url).toBe('https://cdn.example.com/thumb.png')
    })
  })

  it('안전하지 않은 thumbnailUrl(javascript:/data: 등)은 저장 시 null로 대체됨(SSRF 방어)', async () => {
    fetchMeta.mockResolvedValue({
      title: '',
      description: '',
      content: '',
      thumbnailUrl: 'javascript:alert(1)',
    })

    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    await readAllEvents(res)

    const calls: Array<Array<Record<string, unknown>>> = insertSpy.mock.calls
    calls.forEach((call) => {
      expect(call[0].thumbnail_url).toBeNull()
    })
    // 원본 위험 문자열이 저장 페이로드에 그대로 남아있지 않아야 함
    expect(JSON.stringify(calls)).not.toContain('javascript:alert')
  })

  it('카카오 CSV placeholder(title===url) + fetchMeta 실제 title 존재 → upsert title이 fetchMeta title로 승격', async () => {
    // parseKakaoChat은 title에 url을 그대로 채워 넘김(placeholder) — 이미 정규화된 형태(https, 루트 아님,
    // 트래킹 파라미터 없음)의 URL을 써서 dedupeBatch의 normalizeUrl을 거쳐도 title===url 비교가 유지되게 한다.
    const csv = [
      'Date,User,Message',
      '2023-09-15 03:39:04,"김재균","https://kakao-import-test.com/article"',
    ].join('\n')
    fetchMeta.mockResolvedValue({
      title: 'Kakao 실제 제목',
      description: '',
      content: '',
    })

    const res = await POST(makeReq(makeFile(csv, 'chat.csv')))
    const events = await readAllEvents(res)
    const json = readFinalResult(events)
    expect(json.imported).toBe(1)

    const calls: Array<Array<Record<string, unknown>>> = insertSpy.mock.calls
    const inserted = calls.find((c) => c[0].url === 'https://kakao-import-test.com/article')
    expect(inserted?.[0].title).toBe('Kakao 실제 제목')
  })

  it('HTML 임포트(title!==url) → fetchMeta title이 달라도 원래 파싱된 title 유지(승격 안 함)', async () => {
    fetchMeta.mockResolvedValue({
      title: 'Completely Different Meta Title',
      description: '',
      content: '',
    })

    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    await readAllEvents(res)

    const calls: Array<Array<Record<string, unknown>>> = insertSpy.mock.calls
    const nextjsInsert = calls.find((c) => c[0].url === 'https://nextjs.org/')
    expect(nextjsInsert?.[0].title).toBe('Next.js')
  })

  it('A52: fetchMeta 빈 description → title 폴백 (description 미전달)', async () => {
    // 기본 목이 빈 메타 반환
    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    await readAllEvents(res)

    expect(generateTags).toHaveBeenCalledWith(
      expect.objectContaining({ description: undefined }),
    )
    // 임베딩은 title 단독
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

  it('빈 HTML (파싱 0건) → { imported:0, failed:0, skipped:0, duplicate:0 }', async () => {
    const res = await POST(makeReq(makeFile('<html><body>no bookmarks</body></html>')))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ imported: 0, failed: 0, skipped: 0, duplicate: 0 })
    expect(insertSpy).not.toHaveBeenCalled()
    // 0건 응답 경로(스트림 진입 전)에는 애초에 failedItems 자체가 없음
    expect(json).not.toHaveProperty('failedItems')
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
    // 첫 번째 항목(Next.js) 임베딩 실패 → 두 번째(Example)는 성공
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

  // ------ A61: failedItems 신규 테스트 ------

  it('임베딩 실패 항목 → failedItems에 { url, reason: 임베딩 생성 실패 } 기록, 성공 항목은 미포함', async () => {
    createEmbedding
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValueOnce([0.1, 0.2])

    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    const events = await readAllEvents(res)
    const json = readFinalResult(events)

    expect(json.failedItems).toEqual([
      { url: 'https://nextjs.org/', reason: '임베딩 생성 실패' },
    ])
    // 성공한 example.com은 failedItems에 없어야 함
    expect(json.failedItems.some((i) => i.url === 'https://example.com/')).toBe(false)
  })

  it('DB upsert 에러 항목 → failedItems에 { url, reason: 저장 실패 } 기록, error.message 원문 미노출', async () => {
    upsertShouldError = true

    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    const events = await readAllEvents(res)
    const json = readFinalResult(events)

    expect(json.failed).toBe(2)
    expect(json.failedItems).toHaveLength(2)
    json.failedItems.forEach((item) => {
      expect(item.reason).toBe('저장 실패')
    })
    // DB 에러 원문(error.message)이 클라이언트 응답에 노출되면 안 됨
    expect(JSON.stringify(events)).not.toContain('db constraint violation xyz')
  })

  it('그 외 예외(카테고리 upsert 실패 등) → failedItems에 { url, reason: 처리 중 오류 } 기록', async () => {
    categoryUpsertShouldThrow = true

    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    const events = await readAllEvents(res)
    const json = readFinalResult(events)

    expect(json.failed).toBe(2)
    expect(json.failedItems).toHaveLength(2)
    json.failedItems.forEach((item) => {
      expect(item.reason).toBe('처리 중 오류')
    })
  })

  it('failedItems가 없는 정상 케이스 → done 이벤트에 failedItems: [] 포함', async () => {
    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    const events = await readAllEvents(res)
    const json = readFinalResult(events)

    expect(json.failedItems).toEqual([])
  })

  it('progress 이벤트에는 failedItems가 포함되지 않음(완료 시점에만 전달)', async () => {
    createEmbedding.mockRejectedValueOnce(new Error('rate limit')).mockResolvedValueOnce([0.1, 0.2])

    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    const events = await readAllEvents(res)
    const progressEvents = events.filter((e) => e.type === 'progress')

    progressEvents.forEach((e) => {
      expect(e).not.toHaveProperty('failedItems')
    })
  })

  it('응답에 embedding 미포함', async () => {
    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    const events = await readAllEvents(res)
    const json = readFinalResult(events)
    // 최상위 응답 키 검증
    expect(json).not.toHaveProperty('embedding')
    // 직렬화 결과에도 없는지 확인
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
    // 5MB + 1byte 파일 생성
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
    // .html 확장자는 MIME 무관하게 허용 (Zod refine 조건: type === text/html || name.endsWith(.html))
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
    expect(json.imported).toBe(1) // example.com만 신규 저장
    expect(generateTags).toHaveBeenCalledTimes(1) // nextjs.org는 AI 호출 없음
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
    expect(generateTags).toHaveBeenCalledTimes(1) // nextjs.org는 AI 호출 없음, example.com만
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
    // EXISTING_LOOKUP_CHUNK=200 → 250개면 청크1(0~199) + 청크2(200~249)로 나뉨
    const links = Array.from(
      { length: 250 },
      (_, i) => `<DT><A HREF="https://example.com/${i}">BM ${i}</A>`,
    ).join('\n')
    const html = `<DL><p>\n${links}\n</DL><p>`

    // 청크1(성공)에 속한 URL 하나를 기존 URL로 등록 — 정상 중복 판정 확인용
    existingRows = [{ url: 'https://example.com/0', folder_hint: null }]
    // 청크2(200~249)에 속한 URL을 포함시켜 해당 청크의 in() 호출만 에러 처리
    existingLookupFailForUrl = 'https://example.com/200'

    const res = await POST(makeReq(makeFile(html)))
    expect(res.status).toBe(200)
    const events = await readAllEvents(res)
    const json = readFinalResult(events)

    // 청크1의 example.com/0만 duplicate로 잡힘 — 청크2는 조회 실패로 기존 여부를 알 수 없어 전부 신규 처리
    expect(json.duplicate).toBe(1)
    expect(json.imported).toBe(249)

    const calls: Array<Array<Record<string, unknown>>> = insertSpy.mock.calls
    // 청크1에서 중복 판정된 URL은 upsert 대상에서 제외됨
    expect(calls.some((c) => c[0].url === 'https://example.com/0')).toBe(false)
    // 청크2는 조회 자체가 실패했으므로 fail-open — 정상적으로 신규 upsert됨(누락되지 않음)
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
    // 배치 내부: 폴더A → 폴더C 순서로 같은 URL 2번 등장(dedupeBatch가 마지막 등장 '폴더C' 채택 → duplicate 1건).
    // 그 결과물을 DB 기존 URL(folder_hint: ['옛폴더'])과 비교 → 추가로 duplicate 1건, 총 2건.
    // 배치의 마지막 등장('폴더C')과도, DB 기존 값('옛폴더')과도 다르므로 update() 호출 대상.
    existingRows = [{ url: 'https://combo.com/', folder_hint: ['옛폴더'] }]

    const res = await POST(makeReq(makeFile(COMBINED_DUPLICATE_HTML)))
    expect(res.status).toBe(200)
    const events = await readAllEvents(res)
    const json = readFinalResult(events)

    // dedupeBatch의 배치 내부 중복 1건 + 분류 루프의 DB 매치 1건 = 2건
    expect(json.duplicate).toBe(2)
    expect(json.imported).toBe(0)
    expect(json.failed).toBe(0)

    // update()는 배치 내 마지막 등장(폴더C)의 folder_hint로 호출 — DB의 옛 값도, 첫 등장(폴더A)도 아님
    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith({ folder_hint: ['폴더C'] })

    // DB 매치로 완전히 분류된 URL이므로 AI 호출(태깅) 없음, upsert도 없음
    expect(generateTags).not.toHaveBeenCalled()
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('다단계 folder_hint(2단계) 비교 — 두 번째 레벨만 달라도 update 호출, 정확한 새 배열 전달', async () => {
    // DB 기존: ['개발', '백엔드'], 배치: ['개발', '프론트엔드'] — 1단계는 같고 2단계만 다름
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
    // DB 기존과 배치 모두 ['개발', '프론트엔드']로 2단계까지 완전 일치
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

  it('A60: 자체 내보내기 HTML(TAGS·DATA_CATEGORY 포함)은 AI 재태깅 없이 그대로 복원', async () => {
    const SELF_EXPORT_HTML = `<DL><p>
      <DT><A HREF="https://nextjs.org" TAGS="프론트엔드" DATA_CATEGORY="개발">Next.js</A>
    </DL><p>`

    const res = await POST(makeReq(makeFile(SELF_EXPORT_HTML)))
    const events = await readAllEvents(res)
    const json = readFinalResult(events)
    expect(json.imported).toBe(1)

    // TAGS 속성이 있으므로 generateTags(AI 호출) 자체를 건너뛴다
    expect(generateTags).not.toHaveBeenCalled()

    const calls: Array<Array<Record<string, unknown>>> = insertSpy.mock.calls
    const inserted = calls.find((c) => c[0].url === 'https://nextjs.org/')
    expect(inserted?.[0].tags).toEqual(['프론트엔드'])
    expect(inserted?.[0].category_id).toBe('cat-개발')
  })
})
