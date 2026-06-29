import { describe, it, expect, afterEach, vi } from 'vitest'
import { generateTags, createEmbedding } from '../ai'

// E2E_MOCK_OPENAI=1 시 실제 OpenAI 호출 없이 결정적 값 반환 검증.
describe('OpenAI 목 seam (E2E_MOCK_OPENAI)', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('generateTags — 목 모드에서 고정 태그 반환(실 API 미호출)', async () => {
    vi.stubEnv('E2E_MOCK_OPENAI', '1')
    expect(await generateTags({ title: 't', url: 'https://x' })).toEqual([
      '개발',
      '프론트엔드',
      '테스트',
    ])
  })

  it('createEmbedding — 목 모드에서 1536차원 상수 벡터(쿼리·저장 일치)', async () => {
    vi.stubEnv('E2E_MOCK_OPENAI', '1')
    const a = await createEmbedding('저장 텍스트')
    const b = await createEmbedding('완전히 다른 쿼리')
    expect(a).toHaveLength(1536)
    expect(a).toEqual(b) // 동일 벡터 → cosine=1 → 검색 결정적
  })
})
