import { describe, it, expect } from 'vitest'
import { normalizeTags, extractTopCategory, CATEGORY_ALIAS, TAG_ALIAS } from '../tag-alias'

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

describe('extractTopCategory', () => {
  // 입력은 normalizeTags() 거친 배열 — 재정규화 안 함.
  it('첫 번째가 대분류면 추출·제거', () => {
    expect(extractTopCategory(normalizeTags(['dev', 'frontend']))).toEqual({
      category: '개발',
      midTags: ['프론트엔드'],
    })
  })

  it('대분류가 중간에 있어도 추출·제거됨', () => {
    // "유튜브", "콘텐츠" — 기존 resolveTopCategory는 이 케이스에서 null 반환하던 버그
    expect(extractTopCategory(['유튜브', '콘텐츠', '영상편집'])).toEqual({
      category: '콘텐츠',
      midTags: ['유튜브', '영상편집'],
    })
  })

  it('대분류명이 midTags에 남지 않음', () => {
    const { midTags } = extractTopCategory(normalizeTags(['AI', 'LLM', 'RAG']))
    expect(midTags).not.toContain('AI/ML')
    expect(midTags).toEqual(['LLM', 'RAG'])
  })

  it('대분류 없으면 category null, midTags 원본 유지', () => {
    expect(extractTopCategory(['프론트엔드', 'React'])).toEqual({
      category: null,
      midTags: ['프론트엔드', 'React'],
    })
  })

  it('빈 배열', () => {
    expect(extractTopCategory([])).toEqual({ category: null, midTags: [] })
  })
})
