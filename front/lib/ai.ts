import { getOpenAI } from './openai'

// e2e 전용: 실제 OpenAI 호출 회피(비용·지연·flaky 제거). 결정적 목 값 반환.
// 프로덕션 환경엔 절대 미설정 — nightly authed e2e 워크플로에서만 '1'.
// 호출 시점 평가 — import 순서 무관 + 테스트 stubEnv 용이.
const isMockOpenAI = () => process.env.E2E_MOCK_OPENAI === '1'
// 모든 입력에 동일 상수 벡터 → 저장·쿼리 임베딩이 일치(cosine=1)하여 검색 결정적.
const MOCK_EMBEDDING = new Array(1536).fill(0.01)

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

## 중분류 주의
- RAG는 "검색증강생성 기법 자체"를 다룰 때만. LLM API·모델 카드·일반 문서는 중분류 "LLM".
- 논문(arxiv 등)은 소분류 "논문" — 논문 주제를 소분류로 쓰지 않음.
- 쇼핑 상품은 종류(전자기기 등)를 중분류로 반드시 포함.

## 예제
제목: OpenAI API Reference - Chat / URL: platform.openai.com/docs → {"tags":[{"tag":"AI/ML","confidence":0.95},{"tag":"LLM","confidence":0.85},{"tag":"공식문서","confidence":0.8}]}
제목: meta-llama/Llama-3-8B · Hugging Face → {"tags":[{"tag":"AI/ML","confidence":0.95},{"tag":"LLM","confidence":0.85}]}
제목: RAG for Knowledge-Intensive NLP Tasks / URL: arxiv.org → {"tags":[{"tag":"AI/ML","confidence":0.9},{"tag":"RAG","confidence":0.85},{"tag":"논문","confidence":0.85}]}
제목: Buy MacBook Pro - Apple → {"tags":[{"tag":"쇼핑","confidence":0.95},{"tag":"전자기기","confidence":0.9}]}
제목: Storybook 컴포넌트 문서화 가이드 → {"tags":[{"tag":"개발","confidence":0.95},{"tag":"프론트엔드","confidence":0.85},{"tag":"Storybook","confidence":0.85}]}

## 출력
JSON만 반환. 설명 없음. 각 태그에 0~1 confidence 부여 — 확신 없으면 낮게, 추측이면 0.5 미만.
{"tags": [{"tag": "대분류", "confidence": 0.95}, {"tag": "중분류", "confidence": 0.8}, {"tag": "소분류", "confidence": 0.7}]}`

// confidence 미만 태그는 자동 적용 안 함 — 정밀도 우선.
// ponytail: 고정 임계값. 사용자 수정 통계 쌓이면 조정.
const CONFIDENCE_THRESHOLD = 0.6

interface ScoredTag {
  tag: string
  confidence: number
}

// OpenAI 응답에서 confidence 임계값 이상 태그만 추출. 형식 깨지면 빈 배열로 degrade.
export function selectConfidentTags(raw: unknown): string[] {
  const items = (raw as { tags?: unknown })?.tags
  if (!Array.isArray(items)) return []
  return items
    .filter(
      (i): i is ScoredTag =>
        i != null &&
        typeof i.tag === 'string' &&
        i.tag.trim().length > 0 && // 빈 문자열·공백 태그 차단 (DB 오염 방지)
        typeof i.confidence === 'number' &&
        i.confidence >= CONFIDENCE_THRESHOLD,
    )
    .map((i) => i.tag)
    .slice(0, 3)
}

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
  if (isMockOpenAI()) return ['개발', '프론트엔드', '테스트']

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
    max_tokens: 200, // confidence 필드 추가로 응답 길이 증가 — truncation 방지
    temperature: 0, // 분류 작업 — 같은 URL은 같은 태그(결정성). eval 변동성도 축소.
  })

  // truncation 등으로 JSON.parse 실패 시 빈 태그로 degrade.
  try {
    return selectConfidentTags(JSON.parse(completion.choices[0].message.content ?? '{}'))
  } catch {
    return []
  }
}

export async function createEmbedding(text: string): Promise<number[]> {
  if (isMockOpenAI()) return MOCK_EMBEDDING

  const response = await getOpenAI().embeddings.create({
    model: 'text-embedding-3-small', // 기본 1536 차원
    input: text,
  })
  return response.data[0].embedding
}
