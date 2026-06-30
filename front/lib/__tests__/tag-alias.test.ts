import { describe, it, expect } from 'vitest'
import { normalizeTags, resolveCategory, CATEGORY_ALIAS, TAG_ALIAS } from '../tag-alias'

// normalizeTags는 TAG_ALIAS를 먼저 조회 → 같은 키가 양쪽에 있으면 CATEGORY_ALIAS가 영구 무효화됨.
describe('alias 키 충돌 방지', () => {
  it('TAG_ALIAS ∩ CATEGORY_ALIAS = ∅', () => {
    const overlap = Object.keys(TAG_ALIAS).filter((k) => k in CATEGORY_ALIAS)
    expect(overlap).toEqual([])
  })
})

describe('normalizeTags', () => {
  it('영문/약어 → 한국어 정규화', () => {
    expect(normalizeTags(['dev', 'frontend', 'Next.js'])).toEqual([
      '개발',
      '프론트엔드',
      'Next.js',
    ])
  })

  it('alias 없는 소분류는 원본 유지', () => {
    expect(normalizeTags(['AI', 'rag', 'pgvector'])).toEqual([
      'AI/ML',
      'RAG',
      'pgvector',
    ])
  })

  it('빈 배열', () => {
    expect(normalizeTags([])).toEqual([])
  })
})

describe('resolveCategory', () => {
  // AI가 반환한 단일 category 문자열 → 별칭 해석 후 12개 검증.
  it('별칭/정식 이름 → 정식 대분류', () => {
    expect(resolveCategory('dev')).toBe('개발')
    expect(resolveCategory('AI')).toBe('AI/ML')
    expect(resolveCategory('개발')).toBe('개발')
  })

  it('12개에 없거나 null이면 null(미분류)', () => {
    expect(resolveCategory('프론트엔드')).toBeNull() // 중분류는 카테고리 아님
    expect(resolveCategory('잡동사니')).toBeNull()
    expect(resolveCategory(null)).toBeNull()
  })
})
