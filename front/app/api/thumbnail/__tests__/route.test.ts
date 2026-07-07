import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ID = '550e8400-e29b-41d4-a716-446655440000'

let currentUser: unknown = { id: 'u1' }
let bookmarkRow: { thumbnail_url: string | null } | null = { thumbnail_url: 'https://cdn.example.com/thumb.jpg' }
const eqSpy = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser }, error: null }) },
    from: () => ({
      select: () => ({
        eq(col: string, val: unknown) {
          eqSpy(col, val)
          return this
        },
        maybeSingle: async () => ({ data: bookmarkRow, error: null }),
      }),
    }),
  }),
}))

import { GET } from '../route'

function req(id?: string) {
  const url = id ? `http://t/api/thumbnail?id=${id}` : 'http://t/api/thumbnail'
  return new Request(url)
}

function mockImageFetch(overrides: Partial<Response> = {}) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    headers: new Headers({ 'content-type': 'image/jpeg' }),
    arrayBuffer: async () => new ArrayBuffer(10),
    ...overrides,
  } as Response)
}

describe('GET /api/thumbnail', () => {
  beforeEach(() => {
    currentUser = { id: 'u1' }
    bookmarkRow = { thumbnail_url: 'https://cdn.example.com/thumb.jpg' }
    eqSpy.mockReset()
  })

  afterEach(() => vi.restoreAllMocks())

  it('미인증 → 401', async () => {
    currentUser = null
    const res = await GET(req(ID))
    expect(res.status).toBe(401)
  })

  it('잘못된 id 형식 → 400', async () => {
    const res = await GET(req('not-a-uuid'))
    expect(res.status).toBe(400)
  })

  it('user_id로 소유권 격리 (eq 호출)', async () => {
    mockImageFetch()
    await GET(req(ID))
    expect(eqSpy).toHaveBeenCalledWith('id', ID)
    expect(eqSpy).toHaveBeenCalledWith('user_id', 'u1')
  })

  it('북마크 없음/타인 소유 → 404', async () => {
    bookmarkRow = null
    const res = await GET(req(ID))
    expect(res.status).toBe(404)
  })

  it('thumbnail_url 미저장 → 404', async () => {
    bookmarkRow = { thumbnail_url: null }
    const res = await GET(req(ID))
    expect(res.status).toBe(404)
  })

  it('사설망 URL(SSRF 차단) → 404, fetch 미호출', async () => {
    bookmarkRow = { thumbnail_url: 'http://127.0.0.1/x.jpg' }
    global.fetch = vi.fn()
    const res = await GET(req(ID))
    expect(res.status).toBe(404)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('원본 fetch 실패(네트워크 예외) → 502', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network'))
    const res = await GET(req(ID))
    expect(res.status).toBe(502)
  })

  it('원본이 이미지가 아님(content-type 불일치) → 502', async () => {
    mockImageFetch({ headers: new Headers({ 'content-type': 'text/html' }) })
    const res = await GET(req(ID))
    expect(res.status).toBe(502)
  })

  it('정상 이미지 → 200 + Cache-Control 헤더', async () => {
    mockImageFetch()
    const res = await GET(req(ID))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(res.headers.get('cache-control')).toContain('s-maxage')
  })
})
