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

  it('제미나이 ↔ Gemini', () => {
    expect(expandSearchQuery('제미나이')).toEqual(['제미나이', 'Gemini'])
    expect(expandSearchQuery('gemini')).toEqual(['gemini', '제미나이'])
  })

  it('미드저니 ↔ Midjourney', () => {
    expect(expandSearchQuery('미드저니')).toEqual(['미드저니', 'Midjourney'])
    expect(expandSearchQuery('midjourney')).toEqual(['midjourney', '미드저니'])
  })

  it('안드레 카파시 ↔ Andrej Karpathy', () => {
    expect(expandSearchQuery('안드레 카파시')).toEqual(['안드레 카파시', 'Andrej Karpathy'])
    expect(expandSearchQuery('Andrej Karpathy')).toEqual(['Andrej Karpathy', '안드레 카파시'])
  })

  it('컬리 ↔ Kurly', () => {
    expect(expandSearchQuery('컬리')).toEqual(['컬리', 'Kurly'])
    expect(expandSearchQuery('kurly')).toEqual(['kurly', '컬리'])
  })

  it('alias 없는 쿼리 → [원문]만', () => {
    expect(expandSearchQuery('머신러닝 입문')).toEqual(['머신러닝 입문'])
  })

  it('앞뒤 공백은 트림 후 조회', () => {
    expect(expandSearchQuery('  피그마  ')).toEqual(['피그마', 'Figma'])
  })

  // 대화형 쿼리 — 시간참조·지시어·행위어 노이즈 제거 (search-golden conversational 실측 2/8 대응)
  it('시간참조·지시어·행위어 토큰 제거 후 확장', () => {
    expect(expandSearchQuery('지난달 저장한 그 pgvector 아티클')).toEqual(['pgvector 아티클'])
    expect(expandSearchQuery('그 리액트 훅 글')).toEqual(['리액트 훅 글', 'React 훅 글'])
  })

  it('노이즈 제거 후 문장 속 브랜드 토큰도 원어 변형 추가', () => {
    expect(expandSearchQuery('그때 봤던 테일윈드 설치 문서')).toEqual([
      '테일윈드 설치 문서',
      'Tailwind 설치 문서',
    ])
  })

  it('노이즈 토큰만으로 이뤄진 쿼리는 원문 유지 (빈 쿼리 방지)', () => {
    expect(expandSearchQuery('지난달 본')).toEqual(['지난달 본'])
  })

  // 조사 붙은 브랜드 토큰 — 정확일치 실패 시 조사 제거 후 alias 재조회 (search-golden particle 실측 2/4 대응)
  it('조사 붙은 브랜드 토큰도 원어 변형 생성', () => {
    expect(expandSearchQuery('피그마로 디자인 배우는 법')).toEqual([
      '피그마로 디자인 배우는 법',
      'Figma 디자인 배우는 법',
    ])
    expect(expandSearchQuery('리액트를 처음 배울 때 본 문서')).toEqual([
      '리액트를 처음 배울 때 문서',
      'React 처음 배울 때 문서',
    ])
  })

  it('조사 제거 결과가 사전에 없으면 원토큰 유지 (오절단 방지)', () => {
    expect(expandSearchQuery('한글로 검색')).toEqual(['한글로 검색'])
  })

  it('사전에 등록된 모든 한글 키는 유효한 영문 값을 가짐', () => {
    for (const [ko, en] of Object.entries(SEARCH_ALIAS)) {
      expect(ko.length).toBeGreaterThan(0)
      expect(en.length).toBeGreaterThan(0)
    }
  })
})
