import { describe, it, expect, vi, beforeEach } from 'vitest'
import { extractCategories } from '../route'

// --- 순수 집계 함수 ---
describe('extractCategories', () => {
  const cats = [
    { id: 'c1', name: '개발' },
    { id: 'c2', name: '디자인' },
    { id: 'c3', name: '콘텐츠' },
  ]

  it('북마크에 붙은 카테고리명만 distinct 반환', () => {
    const res = extractCategories(
      [{ category_id: 'c1' }, { category_id: 'c3' }, { category_id: 'c1' }],
      cats,
    )
    expect(res.categories).toEqual(['개발', '콘텐츠'])
    expect(res.hasUncategorized).toBe(false)
  })

  it('최근 20개 밖 소수 카테고리도 누락 없이 포함 (본 버그 회귀 방지)', () => {
    // 콘텐츠 북마크가 목록 끝(오래된)에 있어도 집계에 포함돼야 함
    const many = [
      ...Array.from({ length: 25 }, () => ({ category_id: 'c1' })),
      { category_id: 'c3' },
    ]
    const res = extractCategories(many, cats)
    expect(res.categories).toContain('콘텐츠')
  })

  it('category_id null → hasUncategorized true, 목록엔 미포함', () => {
    const res = extractCategories([{ category_id: 'c1' }, { category_id: null }], cats)
    expect(res.categories).toEqual(['개발'])
    expect(res.hasUncategorized).toBe(true)
  })

  it('삭제된 카테고리 참조(매핑 없음) → 미분류로 묶음', () => {
    const res = extractCategories([{ category_id: 'ghost' }], cats)
    expect(res.categories).toEqual([])
    expect(res.hasUncategorized).toBe(true)
  })

  it('빈 북마크 → 빈 목록, 미분류 없음', () => {
    expect(extractCategories([], cats)).toEqual({ categories: [], hasUncategorized: false })
  })
})

// --- GET 라우트 ---
let bookmarkRows: { category_id: string | null }[]
let categoryRows: { id: string; name: string }[]
let bookmarkError: unknown = null
let categoryError: unknown = null

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from(table: string) {
      const result =
        table === 'categories'
          ? { data: categoryRows, error: categoryError }
          : { data: bookmarkRows, error: bookmarkError }
      return {
        select: () => ({
          eq: async () => result,
        }),
      }
    },
  }),
}))

import { GET } from '../route'

const req = () => new Request('http://t/api/bookmarks/categories')

describe('GET /api/bookmarks/categories', () => {
  beforeEach(() => {
    bookmarkError = null
    categoryError = null
    categoryRows = [
      { id: 'c1', name: '개발' },
      { id: 'c3', name: '콘텐츠' },
    ]
    bookmarkRows = [{ category_id: 'c1' }, { category_id: 'c3' }, { category_id: null }]
  })

  it('{ categories, hasUncategorized } 반환', async () => {
    const res = await GET(req())
    const json = await res.json()
    expect(json).toEqual({ categories: ['개발', '콘텐츠'], hasUncategorized: true })
  })

  it('북마크 조회 오류 → 500', async () => {
    bookmarkError = { message: 'db fail' }
    const res = await GET(req())
    expect(res.status).toBe(500)
  })

  it('카테고리 조회 오류 → 500', async () => {
    categoryError = { message: 'db fail' }
    const res = await GET(req())
    expect(res.status).toBe(500)
  })
})
