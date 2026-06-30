import { getOpenAI } from './openai'

// e2e 전용: 실제 OpenAI 호출 회피(비용·지연·flaky 제거). 결정적 목 값 반환.
// 프로덕션 환경엔 절대 미설정 — nightly authed e2e 워크플로에서만 '1'.
// 호출 시점 평가 — import 순서 무관 + 테스트 stubEnv 용이.
const isMockOpenAI = () => process.env.E2E_MOCK_OPENAI === '1'
// 모든 입력에 동일 상수 벡터 → 저장·쿼리 임베딩이 일치(cosine=1)하여 검색 결정적.
const MOCK_EMBEDDING = new Array(1536).fill(0.01)

// 태그 분류 체계: docs/specs/tag-taxonomy.md. 단일 카테고리 1개 + 평면 태그 0~3개(순서 무관).
const SYSTEM_PROMPT = `당신은 북마크 분류기입니다. 웹페이지에 카테고리(category) 1개와 평면 태그(tags) 0~3개를 부여합니다.

## 카테고리 (category) — 정확히 1개
다음 12개 중 가장 잘 맞는 하나. 판단 불가(로그인·오류·광고 페이지)면 "미분류".
개발 · AI/ML · 디자인 · 비즈니스 · 학습 · 쇼핑 · 커뮤니티 · 브랜드 · 게임 · 라이프스타일 · 여행 · 금융

## 태그 (tags) — 평면, 0~3개, 순서 무관
페이지를 설명하는 핵심 키워드. 분야(예: 프론트엔드·RAG·요리)와 구체 기술명·고유명사(예: Next.js·pgvector·Reddit·Nike·리그 오브 레전드)를 자유롭게 나열.
- 계층(대/중/소) 없음 — 동등한 라벨로 취급
- 카테고리명과 동일한 태그 금지 (중복 방지)
- URL로 자명한 정보(플랫폼명 등)는 태그 생략
- 키워드 없으면 빈 배열

## 카테고리 선택 주의
- RAG는 "검색증강생성 기법 자체"를 다룰 때만 태그. LLM API·모델 카드·일반 문서는 태그 "LLM".
- 논문(arxiv 등)은 태그 "논문" — 논문 주제 자체를 태그로 쓰지 않음.
- 쇼핑 상품은 종류(전자기기 등)를 태그로 반드시 포함.
- API·SDK·개발자 문서는 제공사 업종(결제·통신 등)과 무관하게 카테고리 "개발".
- 온라인 강의·코스·부트캠프 페이지는 태그 "강의" 포함.
- 이미지·영상·객체인식 관련 논문·라이브러리는 태그 "컴퓨터비전".
- 커뮤니티: 토론·소통이 목적인 사이트(포럼·SNS·Q&A). 기술 학습 자료 자체는 해당 영역 카테고리(개발 등). 채용·구인구직 사이트는 커뮤니티 아님 → "비즈니스"(태그 "커리어").
- 브랜드: 기업·제품 브랜드 페이지. 구매 액션 페이지는 "쇼핑". 태그는 홈페이지·캠페인·제품홍보·브랜드스토리=마케팅, 뉴스룸·IR·채용·회사소개(about)=기업.
- 게임: 게임 공략·뉴스·리뷰·e스포츠는 카테고리 "게임"(학습 아님). 단, 게임 "개발"(Unity·Unreal 등)은 "개발".
- 라이프스타일: 운동·요리·인테리어·육아·건강(웰니스)·자동차 일상 콘텐츠. 직접 조리 레시피=태그 "요리", 차량 정보·관리=태그 "자동차". 증상·약·진단 등 임상 의료는 카테고리 부여 말 것(확신 없으면 "미분류").
- 여행: 숙소·항공·관광·맛집. 음식점·카페 등 장소 정보는 카테고리 "여행"(태그 "맛집"), 직접 만드는 레시피는 "라이프스타일"(태그 "요리").
- 금융: 투자·부동산·세금·보험. 거주·투자 목적 구분 없이 부동산 매물·시세는 카테고리 "금융"(태그 "부동산"). 환율·주가는 태그 "투자".
- 경계: 식품 구매 페이지=쇼핑(태그 "식품"), 자동차 구매 액션=쇼핑. 정보·관리성 콘텐츠는 라이프스타일.

## 예제
제목: OpenAI API Reference - Chat / URL: platform.openai.com/docs → {"category":"AI/ML","tags":[{"tag":"LLM","confidence":0.85},{"tag":"공식문서","confidence":0.8}]}
제목: meta-llama/Llama-3-8B · Hugging Face → {"category":"AI/ML","tags":[{"tag":"LLM","confidence":0.85}]}
제목: RAG for Knowledge-Intensive NLP Tasks / URL: arxiv.org → {"category":"AI/ML","tags":[{"tag":"RAG","confidence":0.85},{"tag":"논문","confidence":0.85}]}
제목: Buy MacBook Pro - Apple → {"category":"쇼핑","tags":[{"tag":"전자기기","confidence":0.9}]}
제목: Storybook 컴포넌트 문서화 가이드 → {"category":"개발","tags":[{"tag":"프론트엔드","confidence":0.85},{"tag":"Storybook","confidence":0.85}]}
제목: r/webdev - Reddit / URL: reddit.com/r/webdev → {"category":"커뮤니티","tags":[{"tag":"포럼","confidence":0.85},{"tag":"Reddit","confidence":0.85}]}
제목: Nike. Just Do It 브랜드 캠페인 → {"category":"브랜드","tags":[{"tag":"마케팅","confidence":0.85},{"tag":"Nike","confidence":0.85}]}
제목: 발로란트 신규 요원 공략 - 게임메카 → {"category":"게임","tags":[{"tag":"공략","confidence":0.85},{"tag":"발로란트","confidence":0.85}]}
제목: 된장찌개 끓이는 법 황금레시피 → {"category":"라이프스타일","tags":[{"tag":"요리","confidence":0.85}]}
제목: 제주 호텔 예약 / URL: yanolja.com → {"category":"여행","tags":[{"tag":"숙소","confidence":0.85}]}
제목: 전월세 매물 시세 - 네이버부동산 → {"category":"금융","tags":[{"tag":"부동산","confidence":0.85}]}
제목: GitHub 로그인 페이지 → {"category":"미분류","tags":[]}

## 출력
JSON만 반환. 설명 없음. category 1개 + tags 배열(각 {tag, confidence}). confidence 0~1 — 확신 없으면 낮게, 추측이면 0.5 미만. 0.6 미만 태그는 자동 제외됨.
{"category": "대분류", "tags": [{"tag": "키워드", "confidence": 0.85}]}`

// confidence 미만 태그는 자동 적용 안 함 — 정밀도 우선.
// ponytail: 고정 임계값. 사용자 수정 통계 쌓이면 조정.
const CONFIDENCE_THRESHOLD = 0.6

interface ScoredTag {
  tag: string
  confidence: number
}

// 분류 결과: 단일 카테고리(없으면 null) + 평면 태그 배열. category 유효성(12개) 검증은 tag-alias.resolveCategory가 담당.
export interface TaggingResult {
  category: string | null
  tags: string[]
}

// OpenAI 응답에서 category(원본 문자열)와 confidence 임계값 이상 태그를 추출. 형식 깨지면 빈 값으로 degrade.
export function parseTagging(raw: unknown): TaggingResult {
  const category = (raw as { category?: unknown })?.category
  return {
    category: typeof category === 'string' && category.trim().length > 0 ? category.trim() : null,
    tags: selectConfidentTags(raw),
  }
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

export async function classifyBookmark({
  title,
  url,
  description,
}: TaggingInput): Promise<TaggingResult> {
  if (isMockOpenAI()) return { category: '개발', tags: ['프론트엔드', '테스트'] }

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
    temperature: 0, // 분류 작업 — 같은 URL은 같은 결과(결정성). eval 변동성도 축소.
  })

  // truncation 등으로 JSON.parse 실패 시 빈 값으로 degrade.
  try {
    return parseTagging(JSON.parse(completion.choices[0].message.content ?? '{}'))
  } catch {
    return { category: null, tags: [] }
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
