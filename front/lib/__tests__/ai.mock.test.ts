import { describe, it, expect, afterEach, vi } from 'vitest'
import { classifyBookmark, createEmbedding, selectConfidentTags, parseTagging } from '../ai'

describe('selectConfidentTags — confidence 임계값 필터', () => {
  it('0.6 미만 태그 제거', () => {
    const raw = {
      tags: [
        { tag: '개발', confidence: 0.95 },
        { tag: '프론트엔드', confidence: 0.6 },
        { tag: '추측', confidence: 0.4 },
      ],
    }
    expect(selectConfidentTags(raw)).toEqual(['개발', '프론트엔드'])
  })

  it('최대 3개로 절단', () => {
    const raw = {
      tags: Array.from({ length: 5 }, (_, i) => ({ tag: `t${i}`, confidence: 0.9 })),
    }
    expect(selectConfidentTags(raw)).toEqual(['t0', 't1', 't2'])
  })

  it('형식 깨지면 빈 배열', () => {
    expect(selectConfidentTags({})).toEqual([])
    expect(selectConfidentTags({ tags: 'nope' })).toEqual([])
    expect(selectConfidentTags(null)).toEqual([])
    expect(selectConfidentTags({ tags: [{ tag: '개발' }] })).toEqual([]) // confidence 누락
  })
})

describe('parseTagging — category + 평면 tags 분리', () => {
  it('category 문자열 + confidence 통과 tags 추출', () => {
    const raw = {
      category: 'AI/ML',
      tags: [
        { tag: 'LLM', confidence: 0.85 },
        { tag: '추측', confidence: 0.3 },
      ],
    }
    expect(parseTagging(raw)).toEqual({ category: 'AI/ML', tags: ['LLM'] })
  })

  it('category 누락/빈 문자열 → null', () => {
    expect(parseTagging({ tags: [] })).toEqual({ category: null, tags: [] })
    expect(parseTagging({ category: '  ', tags: [] })).toEqual({ category: null, tags: [] })
  })

  it('형식 깨지면 category null + 빈 tags', () => {
    expect(parseTagging(null)).toEqual({ category: null, tags: [] })
    expect(parseTagging({})).toEqual({ category: null, tags: [] })
  })
})

// E2E_MOCK_OPENAI=1 시 실제 OpenAI 호출 없이 결정적 값 반환 검증.
describe('OpenAI 목 seam (E2E_MOCK_OPENAI)', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('classifyBookmark — 목 모드에서 고정 분류 반환(실 API 미호출)', async () => {
    vi.stubEnv('E2E_MOCK_OPENAI', '1')
    expect(await classifyBookmark({ title: 't', url: 'https://x' })).toEqual({
      category: '개발',
      tags: ['프론트엔드', '테스트'],
    })
  })

  it('createEmbedding — 목 모드에서 1536차원 상수 벡터(쿼리·저장 일치)', async () => {
    vi.stubEnv('E2E_MOCK_OPENAI', '1')
    const a = await createEmbedding('저장 텍스트')
    const b = await createEmbedding('완전히 다른 쿼리')
    expect(a).toHaveLength(1536)
    expect(a).toEqual(b) // 동일 벡터 → cosine=1 → 검색 결정적
  })
})
