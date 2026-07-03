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

function makeSupabase(user: unknown) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from(table: string) {
      if (table === 'categories') {
        return {
          upsert: () => ({
            select: () => ({
              single: async () => ({ data: { id: 'cat-개발' }, error: null }),
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
    generateTags.mockResolvedValue(['개발', '프론트엔드'])
    createEmbedding.mockResolvedValue([0.1, 0.2])
    fetchMeta.mockResolvedValue({ title: '', description: '' })
  })

  it('정상 임포트 — 200 + imported 카운트 + folder_hint 보존', async () => {
    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    expect(res.status).toBe(200)

    const json = await res.json()
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

  it('A52: fetchMeta description을 태깅·임베딩 입력으로 전달', async () => {
    fetchMeta.mockResolvedValue({ title: 'meta title', description: 'Next.js 서버 컴포넌트 가이드' })

    await POST(makeReq(makeFile(SAMPLE_HTML)))

    // 태깅에 description 전달 (title+url 굶김 해소)
    expect(generateTags).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Next.js 서버 컴포넌트 가이드' }),
    )
    // 임베딩도 title+description 결합 (약한 벡터 개선)
    expect(createEmbedding).toHaveBeenCalledWith(
      expect.stringContaining('Next.js 서버 컴포넌트 가이드'),
    )
  })

  it('A52: fetchMeta 빈 description → title 폴백 (description 미전달)', async () => {
    // 기본 목이 빈 메타 반환
    await POST(makeReq(makeFile(SAMPLE_HTML)))

    expect(generateTags).toHaveBeenCalledWith(
      expect.objectContaining({ description: undefined }),
    )
    // 임베딩은 title 단독
    expect(createEmbedding).toHaveBeenCalledWith('Next.js')
  })

  it('insert payload에 user_id 포함', async () => {
    await POST(makeReq(makeFile(SAMPLE_HTML)))
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
  })

  it('javascript: URL 스킵 — insert에 포함 안 됨', async () => {
    const html = `<DL><p>
      <DT><A HREF="javascript:void(0)">JS Link</A>
      <DT><A HREF="https://valid.com">Valid</A>
    </DL><p>`
    const res = await POST(makeReq(makeFile(html)))
    const json = await res.json()
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
    const json = await res.json()
    expect(json.failed).toBe(1)
    expect(json.imported).toBe(1)
  })

  it('응답에 embedding 미포함', async () => {
    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    const json = await res.json()
    // 최상위 응답 키 검증
    expect(json).not.toHaveProperty('embedding')
    // 직렬화 결과에도 없는지 확인
    expect(JSON.stringify(json)).not.toContain('embedding')
  })

  it('처리량 상한 초과(501개) → skipped:1 보고, imported+failed==500', async () => {
    const links = Array.from(
      { length: 501 },
      (_, i) => `<DT><A HREF="https://example.com/${i}">BM ${i}</A>`,
    ).join('\n')
    const html = `<DL><p>\n${links}\n</DL><p>`

    const res = await POST(makeReq(makeFile(html)))
    expect(res.status).toBe(200)
    const json = await res.json()
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
  })

  it('DB 기존 URL 재업로드(폴더 경로 동일) → 완전 스킵, duplicate 카운트', async () => {
    existingRows = [{ url: 'https://nextjs.org/', folder_hint: ['개발'] }]

    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    const json = await res.json()

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
    const json = await res.json()

    expect(json.duplicate).toBe(1)
    expect(updateSpy).toHaveBeenCalledWith({ folder_hint: ['개발'] })
    expect(generateTags).toHaveBeenCalledTimes(1) // nextjs.org는 AI 호출 없음, example.com만
  })

  it('배치 내부 동일 URL, 폴더 경로 다름 → 마지막 등장 채택, 1회만 upsert, duplicate 카운트', async () => {
    const res = await POST(makeReq(makeFile(DUPLICATE_DIFFERENT_FOLDER_HTML)))
    const json = await res.json()

    expect(json.duplicate).toBe(1)
    expect(insertSpy).toHaveBeenCalledTimes(1)
    expect(insertSpy.mock.calls[0][0].folder_hint).toEqual(['폴더B'])
  })

  it('배치 내부 동일 URL, 폴더 경로 같음 → 1회만 upsert, duplicate 카운트', async () => {
    const res = await POST(makeReq(makeFile(DUPLICATE_SAME_FOLDER_HTML)))
    const json = await res.json()

    expect(json.duplicate).toBe(1)
    expect(insertSpy).toHaveBeenCalledTimes(1)
  })

  it('기존 URL 조회(select().eq().in()) 에러 → fail-open으로 정상 처리', async () => {
    existingLookupShouldError = true

    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    expect(res.status).toBe(200)
    const json = await res.json()

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
    const json = await res.json()

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
    const json = await res.json()

    expect(json.duplicate).toBe(1)
    expect(json.failed).toBe(0)
  })
})
