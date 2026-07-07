import { getOpenAI } from './openai'

// e2e 전용: 실제 OpenAI 호출 회피(비용·지연·flaky 제거). 결정적 목 값 반환.
// 프로덕션 환경엔 절대 미설정 — nightly authed e2e 워크플로에서만 '1'.
// 호출 시점 평가 — import 순서 무관 + 테스트 stubEnv 용이.
const isMockOpenAI = () => process.env.E2E_MOCK_OPENAI === '1'
// 모든 입력에 동일 상수 벡터 → 저장·쿼리 임베딩이 일치(cosine=1)하여 검색 결정적.
const MOCK_EMBEDDING = new Array(1536).fill(0.01)

// 태그 분류 체계: docs/specs/tag-taxonomy.md. 대→중→소 0~3개.
const SYSTEM_PROMPT = `당신은 북마크 분류기입니다. 웹페이지를 대/중/소 계층으로 분류해 태그 0~3개를 생성합니다.
정밀도를 재현율보다 우선합니다 — 확신이 없으면 태그를 더 적게 반환하세요(틀린 태그보다 빈 태그가 낫습니다).

## 분류 체계
대분류: 개발 · AI/ML · 디자인 · 비즈니스 · 학습 · 쇼핑 · 커뮤니티 · 콘텐츠 · 브랜드 · 게임 · 라이프스타일 · 여행 · 금융
중분류: 대분류 하위 분야 (예: 개발→프론트엔드, AI/ML→RAG, 커뮤니티→포럼, 콘텐츠→블로그, 브랜드→마케팅, 게임→공략, 게임→포럼, 라이프스타일→요리, 여행→숙소, 금융→부동산)
소분류: 구체적 기술명·고유명사 (예: Next.js, pgvector, Reddit, Nike, 리그 오브 레전드)

## 태그 수 규칙
- 0개: 내용 파악 불가(로그인·오류·광고 페이지), 또는 주제는 뚜렷하나 위 13개 대분류 어디에도 안 맞음(종교·법률·임상의료·정치·프로스포츠 관전·반려동물 등) → 억지 태깅 금지, 빈 배열 반환(태그 자체를 생성하지 않음)
- 1개: 대분류만 명확
- 2개: 대+중 식별 (소가 중과 동일하거나 자명할 때)
- 3개: 대+중+소 모두 명확히 다른 정보일 때

## 출력 규칙
- 순서: 항상 대→중→소
- 대분류는 정확히 1개만 — 둘 이상 대분류가 동시에 해당돼 보이면 "대분류 우선순위" 규칙으로 하나만 확정(예: 게임+커뮤니티 동시 후보 시 게임)
- URL로 자명한 정보(플랫폼명 등)는 소분류 생략
- 중분류와 소분류가 같으면 소분류 생략

## 대분류 우선순위 (충돌 시 이 순서로 결정 — 형식보다 목적)
1. 주제가 특정 도메인(개발·디자인·AI/ML·비즈니스·금융·게임·여행)이면 그 도메인. 형식(블로그·영상·매거진)보다 주제 우선 — 토스 기술블로그·개발 유튜브=개발, 디자인 아티클=디자인.
2. 사용자 간 상호작용(게시·댓글·질문·팔로우)이 핵심이면 커뮤니티.
3. 도메인 특정 없는 일방향 읽기·구독물이면 콘텐츠(일반 매거진·뉴스레터·개인 블로그·큐레이션).
4. 여가·엔터·스트리밍이면 라이프스타일.
5. 어느 대분류도 안 맞거나 툴·로그인·정체불명이면 0태그(억지 태깅 금지). 단 도메인·서비스가 명백하면(아래 중분류 주의) 로그인/앱 화면이어도 분류 — title이 URL 통짜·회사명 단독이어도 도메인 지식으로 분류 시도, 정말 불명확할 때만 0태그.

## 중분류 주의
- RAG는 "검색증강생성 기법 자체"를 다룰 때만. LLM API·모델 카드·일반 문서는 중분류 "LLM".
- LLM 챗 서비스(ChatGPT·Claude·Gemini 등) 페이지는 로그인/앱 화면이어도 대분류 "AI/ML", 중분류 "LLM". (정체불명 툴·일반 대시보드는 여전히 0태그 — 여기 명명된 AI 챗 서비스에 한정.)
- 공공데이터·통계 포털(공공데이터포털·KOSIS·통계청 등)은 대분류 "비즈니스", 중분류 "데이터". 단 세금·연말정산·국세(홈택스 등)는 대분류 "금융", 중분류 "세금" — 행정 포털이어도 세무는 금융.
- 디자인·브랜딩 스튜디오/에이전시 회사 홈은 대분류 "브랜드", 중분류 "마케팅"(회사소개·about 중심이면 "기업"). 개별 디자인 작업물·포트폴리오 갤러리(Dribbble·Behance 샷)는 대분류 "디자인".
- 논문(arxiv 등)은 소분류 "논문" — 논문 주제를 소분류로 쓰지 않음.
- 쇼핑 상품은 종류(전자기기 등)를 중분류로 반드시 포함.
- API·SDK·개발자 문서는 제공사 업종(결제·통신 등)과 무관하게 대분류 "개발"(중분류는 기술 성격대로).
- 개발 중분류 확정: Docker·Kubernetes·Vercel·배포·CI/CD·컨테이너·클라우드=인프라. JWT·OAuth·인증·암호화=보안. 결제·통신 SDK도 기술 성격 중분류(백엔드 등), "결제" 같은 업종어 중분류 금지.
- 온라인 강의·코스·부트캠프 페이지는 중분류 "강의"를 반드시 포함. 단 기술서적·도서=학습>책, 자격시험·기사 대비=학습>자격증(강의 아님).
- 비즈니스 중분류: PRD·로드맵·OKR·스프린트=기획(제품관리 아님). 디자인 중분류: 로고·브랜드가이드·아이덴티티=브랜딩.
- 커뮤니티 중분류: Reddit·해커뉴스·게시판=포럼, Discord·Slack·X·채팅=소셜미디어, Stack Overflow·질문답변=Q&A.
- 유튜브 등 플랫폼: 플랫폼명 태그 금지, 영상 주제로 분류. 커리큘럼형 강의 시리즈=학습>강의>주제, 단발 주제 영상(튜토리얼·공략·레시피 등)=주제 대분류. 음악·브이로그·예능 등 매핑 대분류 없으면 0태그.
- 유튜브 채널·크리에이터 페이지(/@handle 등): 채널이 다루는 분야 대분류로 분류. 중분류는 채널이 단일 분야에 명확히 특화됐을 때만 추가(프론트엔드 전문 채널→개발>프론트엔드). 풀스택·범용·다분야 채널은 대분류만(웹·앱 풀스택/여러 언어·분야 개발 강의 채널→개발). 교육 채널도 학습>강의 아닌 분야 대분류로. 가수·브이로거 등 매핑 대분류 없으면 0태그.
- 이미지·영상·객체인식 관련 논문·라이브러리는 중분류 "컴퓨터비전".
- 커뮤니티: 사용자 간 상호작용(게시·댓글·질문·팔로우)이 핵심 기능일 때만(포럼·Q&A·SNS·메이커/개발자 커뮤니티). 블로그·기술블로그·매거진·뉴스레터·RSS리더는 커뮤니티 아님(→ 도메인 또는 콘텐츠). 채용·구인구직은 "비즈니스"(커리어).
- 콘텐츠: 도메인 특정 없는 일방향 읽기·구독물. 중분류 블로그(개인블로그·매거진·brunch·네이버블로그), 뉴스레터, 큐레이션(RSS·애그리게이터). 단 주제가 특정 도메인이면 도메인 우선(개발/디자인 아티클은 그 도메인). 큐레이션은 도메인 없는 일반 글 모음에만 — 이미지·폰트·영상 등 제작 素材 라이브러리=디자인, 개발 리소스 모음(awesome 등)=개발. 스트리밍·영상시청은 콘텐츠 아님 → 라이프스타일.
- 브랜드: 기업·제품 브랜드 페이지. 구매 액션 페이지는 "쇼핑". 중분류는 홈페이지·캠페인·제품홍보·브랜드스토리=마케팅, 뉴스룸·IR·채용·회사소개(about)=기업.
- 게임: 게임 공략·뉴스·리뷰·e스포츠는 대분류 "게임"(학습 아님). 단, 게임 "개발"(Unity·Unreal 등)은 "개발". 대상 게임명이 제목·URL에서 식별 가능하면 소분류에 반드시 포함(예: 메이플스토리, 리그 오브 레전드) — "태그 수 규칙"의 확신도 예외로 취급, 게임명 소분류는 2개 규칙(대+중)보다 우선.
- 게임 전문 커뮤니티·포럼(인벤·디시인사이드 게임 갤러리 등): 특정 게임명이 서브도메인·게시판명·제목에서 식별되면 대분류는 "게임" 확정, 중분류 "포럼"(또는 "커뮤니티") 사용 — 대분류를 "커뮤니티"로 넘기지 않음(우선순위 규칙 1번, 도메인이 상호작용 형식보다 우선). 게임과 무관한 일반 커뮤니티만 대분류 "커뮤니티".
- 라이프스타일: 운동·요리·인테리어·육아·건강(웰니스)·자동차 일상 콘텐츠. 직접 조리 레시피=요리, 차량 정보·관리=자동차. 증상·약·진단 등 임상 의료는 대분류 부여 말 것(확신 없으면 0태그).
- 여행: 숙소·항공·관광·맛집. 음식점·카페 등 장소 정보는 "여행>맛집", 직접 만드는 레시피는 "라이프스타일>요리".
- 금융: 투자·부동산·세금·보험. 거주·투자 목적 구분 없이 부동산 매물·시세는 "금융>부동산". 환율·주가는 "금융>투자".
- 경계: 식품 구매 페이지=쇼핑>식품, 자동차 구매 액션=쇼핑. 정보·관리성 콘텐츠는 라이프스타일.

## 예제
제목: OpenAI API Reference - Chat / URL: platform.openai.com/docs → {"tags":[{"tag":"AI/ML","confidence":0.95},{"tag":"LLM","confidence":0.85},{"tag":"공식문서","confidence":0.8}]}
제목: meta-llama/Llama-3-8B · Hugging Face → {"tags":[{"tag":"AI/ML","confidence":0.95},{"tag":"LLM","confidence":0.85}]}
제목: RAG for Knowledge-Intensive NLP Tasks / URL: arxiv.org → {"tags":[{"tag":"AI/ML","confidence":0.9},{"tag":"RAG","confidence":0.85},{"tag":"논문","confidence":0.85}]}
제목: Buy MacBook Pro - Apple → {"tags":[{"tag":"쇼핑","confidence":0.95},{"tag":"전자기기","confidence":0.9}]}
제목: Storybook 컴포넌트 문서화 가이드 → {"tags":[{"tag":"개발","confidence":0.95},{"tag":"프론트엔드","confidence":0.85},{"tag":"Storybook","confidence":0.85}]}
제목: r/webdev - Reddit / URL: reddit.com/r/webdev → {"tags":[{"tag":"커뮤니티","confidence":0.9},{"tag":"포럼","confidence":0.85},{"tag":"Reddit","confidence":0.85}]}
제목: Nike. Just Do It 브랜드 캠페인 → {"tags":[{"tag":"브랜드","confidence":0.9},{"tag":"마케팅","confidence":0.85},{"tag":"Nike","confidence":0.85}]}
제목: 발로란트 신규 요원 공략 - 게임메카 → {"tags":[{"tag":"게임","confidence":0.9},{"tag":"공략","confidence":0.85},{"tag":"발로란트","confidence":0.85}]}
제목: 메이플스토리 아케인셰이드 사냥터 추천 → {"tags":[{"tag":"게임","confidence":0.9},{"tag":"공략","confidence":0.85},{"tag":"메이플스토리","confidence":0.85}]}
제목: 된장찌개 끓이는 법 황금레시피 → {"tags":[{"tag":"라이프스타일","confidence":0.9},{"tag":"요리","confidence":0.85}]}
제목: 제주 호텔 예약 / URL: yanolja.com → {"tags":[{"tag":"여행","confidence":0.9},{"tag":"숙소","confidence":0.85}]}
제목: 전월세 매물 시세 - 네이버부동산 → {"tags":[{"tag":"금융","confidence":0.9},{"tag":"부동산","confidence":0.85}]}
제목: React useState 15분 완성 / URL: youtube.com/watch → {"tags":[{"tag":"개발","confidence":0.9},{"tag":"프론트엔드","confidence":0.85},{"tag":"React","confidence":0.85}]}
제목: Next.js 풀스택 완주반 (30강) / URL: youtube.com/playlist → {"tags":[{"tag":"학습","confidence":0.9},{"tag":"강의","confidence":0.85},{"tag":"Next.js","confidence":0.8}]}
제목: NewJeans - Supernatural M/V / URL: youtube.com/watch → {"tags":[]}
제목: 프롱트 frongt / URL: youtube.com/@frongt (프론트엔드 개발 강의 채널) → {"tags":[{"tag":"개발","confidence":0.9},{"tag":"프론트엔드","confidence":0.8}]}
제목: 코딩애플 / URL: youtube.com/@codingapple (웹·앱 풀스택 개발 강의 채널) → {"tags":[{"tag":"개발","confidence":0.85}]}
제목: 토스 기술 블로그 / URL: toss.tech → {"tags":[{"tag":"개발","confidence":0.9}]}
제목: 뉴스레터 어피티 / URL: uppity.co.kr → {"tags":[{"tag":"콘텐츠","confidence":0.9},{"tag":"뉴스레터","confidence":0.85}]}
제목: feedly / URL: feedly.com (RSS 리더) → {"tags":[{"tag":"콘텐츠","confidence":0.85},{"tag":"큐레이션","confidence":0.8}]}
제목: Unsplash / URL: unsplash.com (무료 이미지) → {"tags":[{"tag":"디자인","confidence":0.85}]}
제목: awesome / URL: github.com/sindresorhus/awesome (개발 리소스 모음) → {"tags":[{"tag":"개발","confidence":0.9},{"tag":"오픈소스","confidence":0.8}]}
제목: 요즘IT 매거진 / URL: yozm.wishket.com/magazine → {"tags":[{"tag":"콘텐츠","confidence":0.85},{"tag":"블로그","confidence":0.8}]}
제목: Disquiet / URL: disquiet.io (메이커 커뮤니티) → {"tags":[{"tag":"커뮤니티","confidence":0.9},{"tag":"포럼","confidence":0.85}]}
제목: 이지금 [IU Official] / URL: youtube.com/@iu.official (가수 공식 채널) → {"tags":[]}
제목: 제2형 당뇨병 증상과 치료 - 서울아산병원 → {"tags":[]}
제목: 대법원 형사 판례 해설 — 정당방위 성립 요건 → {"tags":[]}
제목: ChatGPT / URL: chat.openai.com → {"tags":[{"tag":"AI/ML","confidence":0.9},{"tag":"LLM","confidence":0.85}]}
제목: 공공데이터포털 / URL: data.go.kr → {"tags":[{"tag":"비즈니스","confidence":0.85},{"tag":"데이터","confidence":0.8}]}
제목: 홈택스 연말정산 간소화 / URL: hometax.go.kr → {"tags":[{"tag":"금융","confidence":0.85},{"tag":"세금","confidence":0.8}]}
제목: 스튜디오 디자인 에이전시 회사 소개 / URL: some-studio.com → {"tags":[{"tag":"브랜드","confidence":0.8},{"tag":"마케팅","confidence":0.75}]}

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
