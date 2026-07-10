import { describe, it, expect } from 'vitest'
import {
  normalizeTags,
  extractTopCategory,
  resolveTopCategory,
  CATEGORY_ALIAS,
  TAG_ALIAS,
} from '../tag-alias'

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

  it('서로 다른 원본 태그가 같은 alias로 매핑되면 dedupe — React key 중복 방지', () => {
    // infra/DevOps/배포 모두 '인프라'로 매핑됨 (TAG_ALIAS 참조)
    expect(normalizeTags(['infra', 'DevOps', '배포'])).toEqual(['인프라'])
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

  it('대분류 토큰이 여러 개면 전부 제거(첫 번째만 category, 나머지는 버림)', () => {
    // normalizeTags가 'AI'→'AI/ML'로 바꿔 대분류가 두 번 등장하는 실제 오염 케이스
    expect(extractTopCategory(normalizeTags(['학습', '강의', 'AI']))).toEqual({
      category: '학습',
      midTags: ['강의'],
    })
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

// A60: PATCH /api/bookmarks/:id 카테고리 수정 시 사용자 입력 유효성 검증용.
describe('resolveTopCategory', () => {
  it('표준 대분류명은 그대로 반환', () => {
    expect(resolveTopCategory('개발')).toBe('개발')
  })

  it('alias 입력은 표준 대분류명으로 정규화', () => {
    expect(resolveTopCategory('dev')).toBe('개발')
    expect(resolveTopCategory('AI')).toBe('AI/ML')
  })

  it('고정 13개 대분류 외 입력은 null', () => {
    expect(resolveTopCategory('존재하지않는카테고리')).toBeNull()
  })

  it('중분류·소분류 등 대분류가 아닌 값은 null', () => {
    expect(resolveTopCategory('프론트엔드')).toBeNull()
  })
})
