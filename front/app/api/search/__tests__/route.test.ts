import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { createEmbedding } = vi.hoisted(() => ({ createEmbedding: vi.fn() }))
vi.mock('@/lib/ai', () => ({ createEmbedding }))

const rpc = vi.fn()
let currentUser: unknown = { id: 'u1' }
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser }, error: null }) },
    rpc,
  }),
}))

import { POST } from '../route'

function req(body: unknown) {
  return new Request('http://t/api/search', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/search', () => {
  beforeEach(() => {
    currentUser = { id: 'u1' }
    createEmbedding.mockReset()
    rpc.mockReset()
    createEmbedding.mockResolvedValue([0.1, 0.2])
    rpc.mockResolvedValue({ data: [{ id: 'bm1', similarity: 0.8 }], error: null })
    delete process.env.SEARCH_MATCH_THRESHOLD
  })

  afterEach(() => {
    delete process.env.SEARCH_MATCH_THRESHOLD
  })

  it('기본 threshold 0.3으로 match_bookmarks RPC 호출', async () => {
    await POST(req({ query: '머신러닝 입문' }))
    expect(createEmbedding).toHaveBeenCalledWith('머신러닝 입문', 'query')
    expect(rpc).toHaveBeenCalledWith('match_bookmarks', {
      query_embedding: [0.1, 0.2],
      match_threshold: 0.3,
      match_count: 20,
      p_user_id: 'u1',
    })
  })

  it('SEARCH_MATCH_THRESHOLD 환경변수로 threshold 조정', async () => {
    process.env.SEARCH_MATCH_THRESHOLD = '0.45'
    await POST(req({ query: 'x' }))
    const callArgs = rpc.mock.calls[0][1]
    expect(callArgs.match_threshold).toBe(0.45)
  })

  it.each([
    ['invalid', 'NaN'],
    ['-0.5', '음수'],
    ['0', '0 (임계값 없어 전체 반환 위험)'],
    ['1.5', '1 초과'],
  ])('SEARCH_MATCH_THRESHOLD=%s (%s) → 기본값 0.3 폴백', async (val) => {
    process.env.SEARCH_MATCH_THRESHOLD = val
    await POST(req({ query: 'x' }))
    expect(rpc.mock.calls[0][1].match_threshold).toBe(0.3)
  })

  it('{ results } 반환', async () => {
    const res = await POST(req({ query: 'x' }))
    const json = await res.json()
    expect(json.results).toEqual([{ id: 'bm1', similarity: 0.8 }])
  })

  it('빈 쿼리 → 400, 임베딩 미호출', async () => {
    const res = await POST(req({ query: '' }))
    expect(res.status).toBe(400)
    expect(createEmbedding).not.toHaveBeenCalled()
  })

  it('50자 초과 → 400', async () => {
    const res = await POST(req({ query: 'a'.repeat(51) }))
    expect(res.status).toBe(400)
  })

  it('미인증 → 401', async () => {
    currentUser = null
    const res = await POST(req({ query: 'x' }))
    expect(res.status).toBe(401)
  })
})
