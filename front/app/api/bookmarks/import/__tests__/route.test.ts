import { describe, it, expect, vi, beforeEach } from 'vitest'

// AI 모킹 — 실제 OpenAI 호출 차단
const { classifyBookmark, createEmbedding } = vi.hoisted(() => ({
  classifyBookmark: vi.fn(),
  createEmbedding: vi.fn(),
}))
vi.mock('@/lib/ai', () => ({ classifyBookmark, createEmbedding }))

// Supabase 모킹: auth + categories 조회 + bookmarks upsert
const insertSpy = vi.fn() // ponytail: alias kept for backward-compat test assertions

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
      // bookmarks upsert — select 체이닝 없음 (배치 임포트는 개수만 집계)
      return {
        upsert(payload: unknown) {
          insertSpy(payload)
          return { error: null }
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

// ------ 테스트 ------

describe('POST /api/bookmarks/import', () => {
  beforeEach(() => {
    currentUser = { id: 'u1' }
    insertSpy.mockReset()
    classifyBookmark.mockReset()
    createEmbedding.mockReset()
    classifyBookmark.mockResolvedValue({ category: '개발', tags: ['프론트엔드'] })
    createEmbedding.mockResolvedValue([0.1, 0.2])
  })

  it('정상 임포트 — 200 + imported 카운트 + folder_hint 보존', async () => {
    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.imported).toBe(2)
    expect(json.failed).toBe(0)

    // folder_hint 보존 확인
    const calls: Array<Array<Record<string, unknown>>> = insertSpy.mock.calls
    const nextjsInsert = calls.find((c) => c[0].url === 'https://nextjs.org')
    expect(nextjsInsert?.[0].folder_hint).toEqual(['개발'])

    // 루트 항목은 null 저장
    const exampleInsert = calls.find((c) => c[0].url === 'https://example.com')
    expect(exampleInsert?.[0].folder_hint).toBeNull()
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

  it('빈 HTML (파싱 0건) → { imported:0, failed:0, skipped:0 }', async () => {
    const res = await POST(makeReq(makeFile('<html><body>no bookmarks</body></html>')))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ imported: 0, failed: 0, skipped: 0 })
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
    expect(insertSpy.mock.calls[0][0].url).toBe('https://valid.com')
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
})
