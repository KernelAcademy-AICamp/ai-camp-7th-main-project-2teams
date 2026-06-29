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

// supabase 서버 클라이언트 모킹: auth + categories 조회 + bookmarks insert
const insertSpy = vi.fn()
const selectArgSpy = vi.fn()

function makeSupabase(user: unknown) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from(table: string) {
      if (table === 'categories') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { id: 'cat-개발' }, error: null }),
            }),
          }),
        }
      }
      // bookmarks
      return {
        insert(payload: Record<string, unknown>) {
          insertSpy(payload)
          return {
            select(cols: string) {
              selectArgSpy(cols)
              return {
                single: async () => ({ data: { id: 'bm1', ...stripped(payload) }, error: null }),
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
    insertSpy.mockReset()
    selectArgSpy.mockReset()
    warnSpy.mockReset()
    generateTags.mockReset()
    createEmbedding.mockReset()
    generateTags.mockResolvedValue(['dev', 'frontend', 'Next.js'])
    createEmbedding.mockResolvedValue([0.1, 0.2, 0.3])
  })

  it('content는 insert payload에 없음 (본문 미저장)', async () => {
    await POST(req({ title: 'T', url: 'https://a.com', content: '비밀 본문' }))
    const payload = insertSpy.mock.calls[0][0]
    expect(payload).not.toHaveProperty('content')
  })

  it('insert에 embedding 포함, tags 정규화, category_id 조회', async () => {
    await POST(req({ title: 'T', url: 'https://a.com', content: 'x' }))
    const payload = insertSpy.mock.calls[0][0]
    expect(payload.embedding).toEqual([0.1, 0.2, 0.3])
    expect(payload.tags).toEqual(['개발', '프론트엔드', 'Next.js'])
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
        url: 'https://a.com',
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
})
