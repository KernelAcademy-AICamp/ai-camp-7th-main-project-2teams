import { describe, it, expect } from 'vitest'
import { expandSearchQuery, SEARCH_ALIAS } from '../search-alias'

describe('expandSearchQuery', () => {
  it('한글 브랜드명 → [원문, 영문]', () => {
    expect(expandSearchQuery('피그마')).toEqual(['피그마', 'Figma'])
  })

  it('영문 브랜드명(대소문자 무관) → [원문, 한글]', () => {
    expect(expandSearchQuery('figma')).toEqual(['figma', '피그마'])
    expect(expandSearchQuery('Figma')).toEqual(['Figma', '피그마'])
  })

  it('유튜브 ↔ YouTube', () => {
    expect(expandSearchQuery('유튜브')).toEqual(['유튜브', 'YouTube'])
    expect(expandSearchQuery('youtube')).toEqual(['youtube', '유튜브'])
  })

  it('alias 없는 쿼리 → [원문]만', () => {
    expect(expandSearchQuery('머신러닝 입문')).toEqual(['머신러닝 입문'])
  })

  it('앞뒤 공백은 트림 후 조회', () => {
    expect(expandSearchQuery('  피그마  ')).toEqual(['피그마', 'Figma'])
  })

  it('사전에 등록된 모든 한글 키는 유효한 영문 값을 가짐', () => {
    for (const [ko, en] of Object.entries(SEARCH_ALIAS)) {
      expect(ko.length).toBeGreaterThan(0)
      expect(en.length).toBeGreaterThan(0)
    }
  })
})
