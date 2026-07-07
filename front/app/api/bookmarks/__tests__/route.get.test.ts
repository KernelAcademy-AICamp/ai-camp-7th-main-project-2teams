import { describe, it, expect, vi, beforeEach } from 'vitest'

// 체이닝 가능한 thenable 쿼리 빌더 모킹
function makeBuilder(result: { data: unknown; count?: number; error: unknown }) {
  const calls = {
    select: null as unknown,
    selectOpts: null as unknown,
    order: null as unknown,
    range: null as unknown,
    eq: [] as unknown[],
    is: [] as unknown[],
    contains: [] as unknown[],
  }
  const q = {
    select(cols: string, opts?: unknown) {
      calls.select = cols
      calls.selectOpts = opts
      return q
    },
    order(c: string, o: unknown) {
      calls.order = [c, o]
      return q
    },
    range(a: number, b: number) {
      calls.range = [a, b]
      return q
    },
    eq(c: string, v: unknown) {
      calls.eq.push([c, v])
      return q
    },
    is(c: string, v: unknown) {
      calls.is.push([c, v])
      return q
    },
    contains(c: string, v: unknown) {
      calls.contains.push([c, v])
      return q
    },
    then(res: (r: unknown) => unknown) {
      return Promise.resolve(result).then(res)
    },
  }
  return { q, calls }
}

let bookmarksBuilder: ReturnType<typeof makeBuilder>
let categoryFound = true

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from(table: string) {
      if (table === 'categories') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: categoryFound ? { id: 'cat-개발' } : null,
                error: null,
              }),
            }),
          }),
        }
      }
      return bookmarksBuilder.q
    },
  }),
}))

import { GET } from '../route'

function req(qs = '') {
  return new Request(`http://t/api/bookmarks${qs}`)
}

describe('GET /api/bookmarks', () => {
  beforeEach(() => {
    categoryFound = true
    bookmarksBuilder = makeBuilder({
      data: [{ id: 'bm1', title: 'T' }],
      count: 1,
      error: null,
    })
  })

  it('select 컬럼에 embedding 미포함', async () => {
    await GET(req())
    expect(bookmarksBuilder.calls.select).not.toContain('embedding')
    expect(bookmarksBuilder.calls.selectOpts).toEqual({ count: 'exact' })
  })

  it('{ bookmarks, total } 반환', async () => {
    const res = await GET(req())
    const json = await res.json()
    expect(json.bookmarks).toEqual([{ id: 'bm1', title: 'T', category: null }])
    expect(json.total).toBe(1)
  })

  it('category:categories(name) 임베드를 category: string으로 평탄화 (카드 수정 모달 프리필용)', async () => {
    bookmarksBuilder = makeBuilder({
      data: [{ id: 'bm1', title: 'T', category: { name: '개발' } }],
      count: 1,
      error: null,
    })
    const res = await GET(req())
    const json = await res.json()
    expect(json.bookmarks).toEqual([{ id: 'bm1', title: 'T', category: '개발' }])
  })

  it('tab=favorites → is_favorite eq true', async () => {
    await GET(req('?tab=favorites'))
    expect(bookmarksBuilder.calls.eq).toContainEqual(['is_favorite', true])
  })

  it('tag → tags contains', async () => {
    await GET(req('?tag=Next.js'))
    expect(bookmarksBuilder.calls.contains).toContainEqual(['tags', ['Next.js']])
  })

  it('category 이름 → category_id eq', async () => {
    await GET(req('?category=개발'))
    expect(bookmarksBuilder.calls.eq).toContainEqual(['category_id', 'cat-개발'])
  })

  it('category=미분류 → category_id is null (categories 조회 안 함)', async () => {
    await GET(req('?category=미분류'))
    expect(bookmarksBuilder.calls.is).toContainEqual(['category_id', null])
    expect(bookmarksBuilder.calls.eq).not.toContainEqual(['category_id', 'cat-개발'])
  })

  it('없는 category → 빈 결과, bookmarks 조회 안 함', async () => {
    categoryFound = false
    const res = await GET(req('?category=없음'))
    const json = await res.json()
    expect(json).toEqual({ bookmarks: [], total: 0 })
    expect(bookmarksBuilder.calls.select).toBeNull()
  })

  it('page/limit → range 계산', async () => {
    await GET(req('?page=2&limit=10'))
    expect(bookmarksBuilder.calls.range).toEqual([10, 19])
  })
})
