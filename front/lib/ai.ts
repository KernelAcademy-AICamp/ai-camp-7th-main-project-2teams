import { getOpenAI } from './openai'

// 태그 분류 체계: docs/specs/tag-taxonomy.md. 대→중→소 0~3개.
const SYSTEM_PROMPT = `당신은 북마크 분류기입니다. 웹페이지를 대/중/소 계층으로 분류해 태그 0~3개를 생성합니다.

## 분류 체계
대분류: 개발 · AI/ML · 디자인 · 비즈니스 · 학습 · 쇼핑
중분류: 대분류 하위 분야 (예: 개발→프론트엔드, AI/ML→RAG)
소분류: 구체적 기술명·고유명사 (예: Next.js, pgvector, 프롬프트엔지니어링)

## 태그 수 규칙
- 0개: 내용 파악 불가 (로그인·오류·광고 페이지)
- 1개: 대분류만 명확
- 2개: 대+중 식별 (소가 중과 동일하거나 자명할 때)
- 3개: 대+중+소 모두 명확히 다른 정보일 때

## 출력 규칙
- 순서: 항상 대→중→소
- URL로 자명한 정보(플랫폼명 등)는 소분류 생략
- 중분류와 소분류가 같으면 소분류 생략

## 출력
JSON만 반환. 설명 없음.
{"tags": ["대분류", "중분류", "소분류"]}`

interface TaggingInput {
  title: string
  url: string
  description?: string
}

export async function generateTags({
  title,
  url,
  description,
}: TaggingInput): Promise<string[]> {
  const userContent = [
    `제목: ${title}`,
    `URL: ${url}`,
    description ? `설명: ${description}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 100,
    temperature: 0.2,
  })

  // max_tokens 제한으로 응답 truncation 시 JSON.parse 실패 가능 → 빈 태그로 degrade.
  let result: { tags?: string[] } = {}
  try {
    result = JSON.parse(completion.choices[0].message.content ?? '{}')
  } catch {
    return []
  }

  return result.tags?.slice(0, 3) ?? []
}

export async function createEmbedding(text: string): Promise<number[]> {
  const response = await getOpenAI().embeddings.create({
    model: 'text-embedding-3-small', // 기본 1536 차원
    input: text,
  })
  return response.data[0].embedding
}
