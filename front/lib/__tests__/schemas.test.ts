import { describe, it, expect } from 'vitest'
import { searchSchema } from '../schemas'

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
