import { describe, it, expect } from 'vitest'
import { searchSchema, bookmarkUpdateSchema } from '../schemas'

// A58: 검색 스키마에 tag/is_favorite 필터 추가 — 둘 다 optional, 기존 동작(둘 다 없을 때) 유지.
describe('searchSchema', () => {
  it('query만 있어도 파싱 성공 (tag/is_favorite 미지정)', () => {
    const parsed = searchSchema.safeParse({ query: '리액트' })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.tag).toBeUndefined()
      expect(parsed.data.is_favorite).toBeUndefined()
    }
  })

  it('tag 지정 시 파싱 성공', () => {
    const parsed = searchSchema.safeParse({ query: '리액트', tag: '프론트엔드' })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.tag).toBe('프론트엔드')
    }
  })

  it('빈 문자열 tag는 실패 (min(1))', () => {
    const parsed = searchSchema.safeParse({ query: '리액트', tag: '' })
    expect(parsed.success).toBe(false)
  })

  it('is_favorite: true 파싱 성공', () => {
    const parsed = searchSchema.safeParse({ query: '리액트', is_favorite: true })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.is_favorite).toBe(true)
    }
  })

  it('is_favorite: false 파싱 성공', () => {
    const parsed = searchSchema.safeParse({ query: '리액트', is_favorite: false })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.is_favorite).toBe(false)
    }
  })

  it('is_favorite에 문자열 전달 시 실패 (boolean 타입 검증)', () => {
    const parsed = searchSchema.safeParse({ query: '리액트', is_favorite: 'true' })
    expect(parsed.success).toBe(false)
  })

  it('category/tag/is_favorite 모두 지정해도 파싱 성공 (복합 필터)', () => {
    const parsed = searchSchema.safeParse({
      query: '리액트',
      category: '개발',
      tag: '프론트엔드',
      is_favorite: true,
    })
    expect(parsed.success).toBe(true)
  })
})

// A60: PATCH /api/bookmarks/:id 확장 — 태그/카테고리/설명 부분 수정.
describe('bookmarkUpdateSchema', () => {
  it('is_favorite 단독 파싱 성공 (기존 즐겨찾기 토글 하위 호환)', () => {
    const parsed = bookmarkUpdateSchema.safeParse({ is_favorite: true })
    expect(parsed.success).toBe(true)
  })

  it('tags 배열만 있어도 파싱 성공', () => {
    const parsed = bookmarkUpdateSchema.safeParse({ tags: ['프론트엔드', 'React'] })
    expect(parsed.success).toBe(true)
  })

  it('category 문자열만 있어도 파싱 성공', () => {
    const parsed = bookmarkUpdateSchema.safeParse({ category: '개발' })
    expect(parsed.success).toBe(true)
  })

  it('description 문자열/ null 모두 파싱 성공', () => {
    expect(bookmarkUpdateSchema.safeParse({ description: '메모' }).success).toBe(true)
    expect(bookmarkUpdateSchema.safeParse({ description: null }).success).toBe(true)
  })

  it('여러 필드 동시 지정도 파싱 성공', () => {
    const parsed = bookmarkUpdateSchema.safeParse({
      tags: ['개발'],
      category: '개발',
      description: 'd',
      is_favorite: false,
    })
    expect(parsed.success).toBe(true)
  })

  it('빈 body({}) → refine 실패 (변경 필드 0개)', () => {
    const parsed = bookmarkUpdateSchema.safeParse({})
    expect(parsed.success).toBe(false)
  })

  it('tags에 빈 문자열 포함 시 실패 (min(1))', () => {
    const parsed = bookmarkUpdateSchema.safeParse({ tags: ['개발', ''] })
    expect(parsed.success).toBe(false)
  })

  it('tags 2개 초과 시 실패 (max(2))', () => {
    const parsed = bookmarkUpdateSchema.safeParse({
      tags: Array.from({ length: 3 }, (_, i) => `tag${i}`),
    })
    expect(parsed.success).toBe(false)
  })

  it('is_favorite에 잘못된 타입 전달 시 실패', () => {
    const parsed = bookmarkUpdateSchema.safeParse({ is_favorite: 'true' })
    expect(parsed.success).toBe(false)
  })
})
