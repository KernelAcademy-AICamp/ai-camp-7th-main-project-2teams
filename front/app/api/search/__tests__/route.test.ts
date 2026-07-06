import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { createEmbedding } = vi.hoisted(() => ({ createEmbedding: vi.fn() }))
vi.mock('@/lib/ai', () => ({ createEmbedding }))

const rpc = vi.fn()
const categorySingle = vi.fn()
let currentUser: unknown = { id: 'u1' }
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser }, error: null }) },
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ single: categorySingle }) }) }),
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
    categorySingle.mockReset()
    createEmbedding.mockResolvedValue([0.1, 0.2])
    rpc.mockResolvedValue({ data: [{ id: 'bm1', similarity: 0.8 }], error: null })
    delete process.env.SEARCH_MATCH_THRESHOLD
  })

  afterEach(() => {
    delete process.env.SEARCH_MATCH_THRESHOLD
  })

  it('기본 threshold 0.3으로 match_bookmarks RPC 호출 (query_text 포함, trgm 병합용)', async () => {
    await POST(req({ query: '머신러닝 입문' }))
    expect(createEmbedding).toHaveBeenCalledWith('머신러닝 입문')
    expect(rpc).toHaveBeenCalledWith('match_bookmarks', {
      query_embedding: [0.1, 0.2],
      query_text: '머신러닝 입문',
      match_threshold: 0.3,
      match_count: 20,
      p_user_id: 'u1',
      p_category_id: null,
      p_uncategorized: false,
      p_tags: null,
      p_is_favorite: null,
    })
  })

  // A58: 태그·즐겨찾기 필터 — 지정 없으면 기존 동작(둘 다 null) 100% 유지.
  it('tag 미지정 시 p_tags: null 전달 (회귀 방지)', async () => {
    await POST(req({ query: 'x' }))
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_tags: null, p_is_favorite: null })
  })

  it('tag 지정 시 RPC에 p_tags: [tag] 전달 (A58)', async () => {
    await POST(req({ query: 'x', tag: '리액트' }))
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_tags: ['리액트'], p_is_favorite: null })
  })

  it('is_favorite: true 지정 시 RPC에 p_is_favorite: true 전달 (A58)', async () => {
    await POST(req({ query: 'x', is_favorite: true }))
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_tags: null, p_is_favorite: true })
  })

  it('tag + is_favorite 복합 필터 동시 전달 (A58, "즐겨찾기 중 리액트" 케이스)', async () => {
    await POST(req({ query: '리액트', tag: '리액트', is_favorite: true }))
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_tags: ['리액트'], p_is_favorite: true })
  })

  it('category + tag + is_favorite 모두 지정해도 각 필터 정확히 전달 (복합 필터 회귀 방지)', async () => {
    categorySingle.mockResolvedValue({ data: { id: 'cat1' }, error: null })
    await POST(req({ query: 'x', category: 'AI/ML', tag: '리액트', is_favorite: true }))
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_category_id: 'cat1',
      p_uncategorized: false,
      p_tags: ['리액트'],
      p_is_favorite: true,
    })
  })

  it('카테고리 지정 시 category_id 조회 후 RPC에 p_category_id 전달 (A55)', async () => {
    categorySingle.mockResolvedValue({ data: { id: 'cat1' }, error: null })
    await POST(req({ query: 'x', category: 'AI/ML' }))
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_category_id: 'cat1', p_uncategorized: false })
  })

  it('존재하지 않는 카테고리명 → 빈 결과, RPC 미호출', async () => {
    categorySingle.mockResolvedValue({ data: null, error: null })
    const res = await POST(req({ query: 'x', category: '없는카테고리' }))
    const json = await res.json()
    expect(json.results).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })

  it('미분류 선택 시 category_id 조회 없이 p_uncategorized: true 전달', async () => {
    await POST(req({ query: 'x', category: '미분류' }))
    expect(categorySingle).not.toHaveBeenCalled()
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_category_id: null, p_uncategorized: true })
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
