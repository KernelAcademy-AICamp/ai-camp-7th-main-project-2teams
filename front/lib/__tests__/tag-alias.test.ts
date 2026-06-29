import { describe, it, expect } from 'vitest'
import { normalizeTags, resolveTopCategory, CATEGORY_ALIAS, TAG_ALIAS } from '../tag-alias'

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

describe('resolveTopCategory', () => {
  it('정규화 후 top 6이면 해당 값', () => {
    expect(resolveTopCategory(['dev', 'frontend'])).toBe('개발')
    expect(resolveTopCategory(['AI', 'LLM'])).toBe('AI/ML')
  })

  it('top 6 아니면 null', () => {
    expect(resolveTopCategory(['프론트엔드'])).toBeNull()
    expect(resolveTopCategory([])).toBeNull()
  })
})
