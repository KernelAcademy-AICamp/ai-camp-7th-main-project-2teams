import { describe, it, expect } from 'vitest'
import { parseFilterQuery, buildFilterQuery } from '../filterQuery'

describe('parseFilterQuery', () => {
  // 회귀: 쿼리가 비면 모든 필터가 리셋되어야 한다 (active 잔류 방지)
  it('빈 쿼리 → 전부 리셋(null/all)', () => {
    expect(parseFilterQuery('')).toEqual({
      category: null,
      folder: null,
      tag: null,
      tab: 'all',
    })
  })

  // 회귀: 즐겨찾기 탭에서 로고 클릭(쿼리 제거) 시 tab이 all로 돌아와야 한다
  it('tab 파라미터 없으면 all', () => {
    expect(parseFilterQuery('category=개발').tab).toBe('all')
  })

  it('tab=favorites 인식', () => {
    expect(parseFilterQuery('tab=favorites').tab).toBe('favorites')
  })

  it('알 수 없는 tab 값은 all로 정규화', () => {
    expect(parseFilterQuery('tab=categories').tab).toBe('all')
  })

  it('category/folder/tag 파싱', () => {
    const f = parseFilterQuery('category=개발&folder=일&tag=react')
    expect(f).toEqual({ category: '개발', folder: '일', tag: 'react', tab: 'all' })
  })
})

describe('buildFilterQuery', () => {
  const empty = { category: null, folder: null, tag: null, tab: 'all' }

  it('빈 상태 → 빈 문자열 (stale 파라미터 없음)', () => {
    expect(buildFilterQuery(empty)).toBe('')
  })

  it('all 탭은 URL에 미반영', () => {
    expect(buildFilterQuery({ ...empty, tab: 'all' })).toBe('')
  })

  it('favorites 탭만 반영', () => {
    expect(buildFilterQuery({ ...empty, tab: 'favorites' })).toBe('tab=favorites')
  })

  it('from=extension 보존', () => {
    expect(buildFilterQuery({ ...empty, fromExtension: true })).toBe('from=extension')
  })

  it('category + from 조합', () => {
    const qs = buildFilterQuery({ ...empty, category: '개발', fromExtension: true })
    expect(qs).toBe('category=%EA%B0%9C%EB%B0%9C&from=extension')
  })
})

describe('parse ↔ build 왕복', () => {
  it('favorites 라운드트립 유지', () => {
    const built = buildFilterQuery({ category: null, folder: null, tag: null, tab: 'favorites' })
    expect(parseFilterQuery(built).tab).toBe('favorites')
  })

  it('카테고리 라운드트립 유지', () => {
    const built = buildFilterQuery({ category: '학습', folder: null, tag: null, tab: 'all' })
    const parsed = parseFilterQuery(built)
    expect(parsed.category).toBe('학습')
    expect(parsed.tab).toBe('all')
  })
})
