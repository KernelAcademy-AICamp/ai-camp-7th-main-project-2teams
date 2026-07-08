import { describe, it, expect, vi, beforeEach } from 'vitest'

// AI 모킹 — 실제 OpenAI 호출 차단 (vi.hoisted: factory가 init 시점에 참조)
const { generateTags, createEmbedding } = vi.hoisted(() => ({
  generateTags: vi.fn(),
  createEmbedding: vi.fn(),
}))
vi.mock('@/lib/ai', () => ({ generateTags, createEmbedding }))

// logger 모킹 — weak-vector 경고 로그 검증용 (content 평문 노출 없음 확인)
const { warnSpy } = vi.hoisted(() => ({ warnSpy: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { warn: warnSpy, log: vi.fn(), error: vi.fn() } }))

// fetchMeta 모킹 — 실네트워크 차단. 항상 호출되므로(이번 변경) 기본값 반환 필요.
// isDeadStatus는 순수 함수라 실제 구현 그대로 사용(별도 모킹 불필요).
const { fetchMeta } = vi.hoisted(() => ({ fetchMeta: vi.fn() }))
vi.mock('@/lib/fetchMeta', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/fetchMeta')>()
  return { ...actual, fetchMeta }
})

// supabase 서버 클라이언트 모킹: auth + categories upsert + bookmarks 중복검사/insert
const insertSpy = vi.fn()
const selectArgSpy = vi.fn()
// 중복 선검사 결과·insert 에러 제어 (테스트별로 beforeEach에서 리셋)
let existingBookmark: unknown = null
let insertError: { code?: string; message: string } | null = null

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
      // bookmarks
      return {
        // 중복 선검사: select('id').eq('user_id').eq('url').maybeSingle()
        select() {
          return {
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: existingBookmark, error: null }),
              }),
            }),
          }
        },
        insert(payload: Record<string, unknown>) {
          insertSpy(payload)
          return {
            select(cols: string) {
              selectArgSpy(cols)
              return {
                single: async () =>
                  insertError
                    ? { data: null, error: insertError }
                    : { data: { id: 'bm1', ...stripped(payload) }, error: null },
              }
            },
          }
        },
      }
    },
  }
}

// insert payload에서 응답에 노출되면 안 되는 컬럼 제거 (테스트용 모의 select 결과)
function stripped(p: Record<string, unknown>) {
  const { embedding, user_id, ...rest } = p
  void embedding
  void user_id
  return rest
}

let currentUser: unknown = { id: 'u1' }
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => makeSupabase(currentUser),
}))

import { POST } from '../route'

function req(body: unknown) {
  return new Request('http://t/api/bookmarks', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/bookmarks', () => {
  beforeEach(() => {
    currentUser = { id: 'u1' }
    existingBookmark = null
    insertError = null
    insertSpy.mockReset()
    selectArgSpy.mockReset()
    warnSpy.mockReset()
    generateTags.mockReset()
    createEmbedding.mockReset()
    generateTags.mockResolvedValue(['dev', 'frontend', 'Next.js'])
    createEmbedding.mockResolvedValue([0.1, 0.2, 0.3])
    fetchMeta.mockReset()
    fetchMeta.mockResolvedValue({ title: '', description: '', thumbnailUrl: '', content: '' })
  })

  it('content는 insert payload에 없음 (본문 미저장)', async () => {
    await POST(req({ title: 'T', url: 'https://a.com', content: '비밀 본문' }))
    const payload = insertSpy.mock.calls[0][0]
    expect(payload).not.toHaveProperty('content')
  })

  it('이미 저장된 URL → 409, AI 미호출, insert 안 함', async () => {
    existingBookmark = { id: 'bm-existing' }
    const res = await POST(req({ title: 'T', url: 'https://a.com' }))
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.duplicate).toBe(true)
    expect(generateTags).not.toHaveBeenCalled()
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('동시 저장 경합 — insert unique 위반(23505) → 409', async () => {
    insertError = { code: '23505', message: 'duplicate key value' }
    const res = await POST(req({ title: 'T', url: 'https://a.com', content: 'x' }))
    expect(res.status).toBe(409)
    expect((await res.json()).duplicate).toBe(true)
  })

  it('insert에 embedding 포함, tags 정규화, category_id 조회', async () => {
    await POST(req({ title: 'T', url: 'https://a.com', content: 'x' }))
    const payload = insertSpy.mock.calls[0][0]
    expect(payload.embedding).toEqual([0.1, 0.2, 0.3])
    expect(payload.tags).toEqual(['프론트엔드', 'Next.js'])
    expect(payload.category_id).toBe('cat-개발')
    expect(payload.user_id).toBe('u1')
  })

  it('select 컬럼에 embedding 미포함 (응답 누출 방지)', async () => {
    await POST(req({ title: 'T', url: 'https://a.com' }))
    expect(selectArgSpy.mock.calls[0][0]).not.toContain('embedding')
  })

  it('201 + { bookmark }', async () => {
    const res = await POST(req({ title: 'T', url: 'https://a.com' }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.bookmark.id).toBe('bm1')
  })

  it('잘못된 body → 400, AI 미호출', async () => {
    const res = await POST(req({ title: '', url: 'not-a-url' }))
    expect(res.status).toBe(400)
    expect(generateTags).not.toHaveBeenCalled()
  })

  it('미인증 → 401', async () => {
    currentUser = null
    const res = await POST(req({ title: 'T', url: 'https://a.com' }))
    expect(res.status).toBe(401)
  })

  it('임베딩 실패 → 502, insert 안 함', async () => {
    createEmbedding.mockRejectedValue(new Error('rate limit'))
    const res = await POST(req({ title: 'T', url: 'https://a.com', content: 'x' }))
    expect(res.status).toBe(502)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('태깅 실패 → 빈 태그로 저장(degrade)', async () => {
    generateTags.mockRejectedValue(new Error('parse fail'))
    const res = await POST(req({ title: 'T', url: 'https://a.com', content: 'x' }))
    expect(res.status).toBe(201)
    const payload = insertSpy.mock.calls[0][0]
    expect(payload.tags).toEqual([])
    expect(payload.category_id).toBeNull()
  })

  it('content 없음 → [weak-vector] 경고 로그 (url·title·user_id 포함, content 값 미노출)', async () => {
    await POST(req({ title: 'T', url: 'https://a.com' }))
    expect(warnSpy).toHaveBeenCalledWith(
      '[weak-vector]',
      expect.objectContaining({
        url: 'https://a.com/', // normalizeUrl canonical (루트 slash)
        title: 'T',
        user_id: 'u1',
        reason: expect.stringContaining('content 없음'),
      }),
    )
    // 경고 로그 인자에 content 키 없음 (값 노출 방지)
    const logObj = warnSpy.mock.calls[0][1] as Record<string, unknown>
    expect(logObj).not.toHaveProperty('content')
  })

  it('content 공백만 → [weak-vector] 경고 발생 (약한 벡터)', async () => {
    await POST(req({ title: 'T', url: 'https://a.com', content: '   ' }))
    expect(warnSpy).toHaveBeenCalledWith('[weak-vector]', expect.anything())
  })

  it('content 있으면 [weak-vector] 경고 없음', async () => {
    await POST(req({ title: 'T', url: 'https://a.com', content: '본문 있음' }))
    expect(warnSpy).not.toHaveBeenCalledWith('[weak-vector]', expect.anything())
  })

  it('description은 항상 fetchMeta 결과로 저장 (content 유무 무관)', async () => {
    fetchMeta.mockResolvedValueOnce({
      title: '',
      description: '요약',
      thumbnailUrl: '',
      content: '',
    })
    await POST(req({ title: 'T', url: 'https://a.com', content: '본문 있음' }))
    const payload = insertSpy.mock.calls[0][0]
    expect(payload.description).toBe('요약')
  })

  it('익스텐션 content 있어도 thumbnail_url 채워짐 (기존 버그 수정)', async () => {
    fetchMeta.mockResolvedValueOnce({
      title: '',
      description: '',
      thumbnailUrl: 'https://a.com/thumb.jpg',
      content: '',
    })
    await POST(req({ title: 'T', url: 'https://a.com', content: '본문 있음' }))
    const payload = insertSpy.mock.calls[0][0]
    expect(payload.thumbnail_url).toBe('https://a.com/thumb.jpg')
  })

  it('익스텐션 content 있으면 그 값이 임베딩 입력, meta.content는 무시', async () => {
    fetchMeta.mockResolvedValueOnce({
      title: '',
      description: '',
      thumbnailUrl: '',
      content: '서버추출본문',
    })
    await POST(req({ title: 'T', url: 'https://a.com', content: '익스텐션본문' }))
    expect(createEmbedding).toHaveBeenCalledWith('T\n익스텐션본문')
  })

  it('익스텐션 content 없으면 meta.content가 임베딩 입력으로 쓰임', async () => {
    fetchMeta.mockResolvedValueOnce({
      title: '',
      description: '',
      thumbnailUrl: '',
      content: '서버추출본문',
    })
    await POST(req({ title: 'T', url: 'https://a.com' }))
    expect(createEmbedding).toHaveBeenCalledWith('T\n서버추출본문')
  })
})
