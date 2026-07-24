import { getOpenAI } from "./openai";

// e2e 전용: 실제 OpenAI 호출 회피(비용·지연·flaky 제거). 결정적 목 값 반환.
// 프로덕션 환경엔 절대 미설정 — nightly authed e2e 워크플로에서만 '1'.
// 호출 시점 평가 — import 순서 무관 + 테스트 stubEnv 용이.
const isMockOpenAI = () => process.env.E2E_MOCK_OPENAI === "1";
// 모든 입력에 동일 상수 벡터 → 저장·쿼리 임베딩이 일치(cosine=1)하여 검색 결정적.
const MOCK_EMBEDDING = new Array(1536).fill(0.01);

// 태그 분류 체계: docs/specs/tag-taxonomy.md (v2 형식축). 대→중→소 0~3개.
// v2: 중분류 = 닫힌 enum. 콘텐츠형 대분류는 행동양식(형식), 대상형 대분류는 도메인 고정. 자유 생성 금지.
const SYSTEM_PROMPT = `당신은 북마크 분류기입니다. 웹페이지를 대/중/소 계층으로 분류해 태그 0~3개를 생성합니다.
정밀도를 재현율보다 우선합니다 — 확신이 없으면 태그를 더 적게 반환하세요(틀린 태그보다 빈 태그가 낫습니다).
유사 태그 추론 금지 — 제목·설명·URL에 명시된 정보만 사용하세요.

## 분류 체계 (대분류=주제, 중분류=닫힌 목록, 소분류=고유명사)
대분류 13개: 개발 · AI/ML · 디자인 · 비즈니스 · 학습 · 쇼핑 · 커뮤니티 · 콘텐츠 · 브랜드 · 게임 · 라이프스타일 · 여행 · 금융

중분류는 반드시 아래 목록에서만 선택 — 목록 밖 단어를 중분류로 생성 금지:
- 콘텐츠형 대분류(개발·AI/ML·디자인·비즈니스·학습·콘텐츠·게임)의 중분류 = 콘텐츠 형식:
  강의 · 공식문서 · 논문 · 아티클 · 뉴스 · 리뷰 · 도구 · 큐레이션 · 뉴스레터 · 책 · 자격증 (게임 한정 추가: 공략 · e스포츠 · 포럼)
- 대상형 대분류의 중분류:
  커뮤니티→포럼·Q&A·소셜미디어 / 브랜드→마케팅·기업 / 라이프스타일→운동·요리·인테리어·육아·건강·자동차 / 여행→숙소·항공·관광·맛집 / 금융→투자·부동산·세금·보험 / 쇼핑→전자기기·소프트웨어·패션·식품·기타용품

소분류: 구체 고유명사·기술명 (Next.js, 헤르메스, ChatGPT, 리그 오브 레전드). 주제 분야명(프론트엔드·LLM·RAG 등)도 소분류로만 사용.

## 태그 수 규칙
- 0개: 내용 파악 불가(로그인·오류·광고 페이지), 또는 13개 대분류 어디에도 안 맞음(종교·법률·임상의료·정치·프로스포츠 관전·반려동물·음악감상 등) → 억지 태깅 금지, 빈 배열 반환
- 1개: 대분류만 명확 / 2개: 대+중 / 3개: 대+중+소 모두 명확

## 대분류 결정 (주제 우선)
1. 주제가 특정 도메인(개발·디자인·AI/ML·비즈니스·금융·게임·여행)이면 그 도메인. 형식(블로그·영상)보다 주제 우선 — 토스 기술블로그·개발 유튜브=개발, AI툴 사용법 영상=AI/ML.
2. AI 서비스·AI 코딩 에이전트(ChatGPT·Claude·Gemini·Claude Code·Codex·Cursor·헤르메스 등) 자체, 또는 그 활용법·에이전트·하네스·워크플로우·스킬·프롬프트 설계가 주제면 "AI/ML"(코딩툴을 써도 AI 방법론이 주제면 AI/ML). ML·데이터분석 라이브러리·추론엔진(OpenCV·pandas·vLLM 등)도 "AI/ML"(단 DB·인프라·언어/프레임워크 PostgreSQL·Kubernetes·React 등은 개발). 단 그 툴로 특정 언어/프레임워크 구현·앱 배포 등 구체적 개발 산출물을 만드는 게 주제면 그 도메인(n8n으로 GitHub 자동화="개발").
3. 학습: 커리큘럼형 코스·부트캠프·N강 완주반, 또는 주제가 12개 도메인 밖(수학·어학 등)일 때만. 단발 how-to 영상은 주제 도메인.
4. 사용자 간 상호작용(게시·댓글·질문)이 핵심이면 커뮤니티. 단 게임 커뮤니티(인벤 등)는 게임>포럼.
5. 도메인 특정 없는 일방향 읽기·구독물이면 콘텐츠.
6. 어느 대분류도 안 맞거나 정체불명이면 빈 배열. 단 도메인이 명백한 서비스는 로그인/앱 화면이어도 분류(ChatGPT=AI/ML>도구).

## 중분류(형식) 판별
- 강의: 튜토리얼·how-to·세팅법·활용법·코스 — 따라하며 배우는 콘텐츠 (영상·글 불문)
- 공식문서: 공식 레퍼런스·API 문서·가이드·용어집
- 논문: arxiv 등 연구 논문. 주제(RAG·컴퓨터비전)는 소분류로
- 아티클: 블로그 글·매거진·에세이·회고 — 읽는 서사 콘텐츠 (배우기 목적이면 강의)
- 도구: 서비스·툴·SaaS 자체 페이지(랜딩·앱 화면). 채용 플랫폼·통계 포털도 도구
- 큐레이션: 모음·리스트(awesome)·소재 라이브러리(Unsplash)·작품 갤러리(Dribbble)·RSS 리더·템플릿 모음
- 뉴스: 소식·발표·패치노트
- 유튜브 강의 채널(/@handle): 분야 대분류>강의(+특화 분야 소분류). 가수·브이로거 채널은 빈 배열

## 경계 규칙
- 공공데이터·통계 포털=비즈니스>도구. 단 세금·연말정산(홈택스)=금융>세금.
- 디자인 스튜디오·에이전시 회사 홈=브랜드>마케팅(회사소개 중심이면 기업). 작품 갤러리(Dribbble 샷)=디자인>큐레이션.
- 게임: 대상 게임명이 식별되면 소분류에 반드시 포함(메이플스토리·발로란트). 게임 개발(Unity)은 개발.
- 채용·구인구직 플랫폼=비즈니스>도구. 커리어 조언 콘텐츠=비즈니스>아티클 또는 >강의.
- 제품 기획·서비스 구체화·요구사항 정의·PM·로드맵·우선순위 결정 = 비즈니스(디자인 아님). 형식은 강의/아티클, 기획 산출물명(PRD 등)은 소분류. "서비스 구체화·기능 정의 기준" 같은 제목을 디자인으로 흡수 금지 — UI/그래픽 실무가 주제일 때만 디자인.
- 레시피=라이프스타일>요리, 음식점 정보=여행>맛집, 부동산 매물·시세=금융>부동산, 환율·주가=금융>투자.
- 소분류는 제목·URL·설명에 명시된 고유명만 — 명시 안 된 툴명 추론 삽입 금지(n8n·LangChain 등으로 대체 금지). 제목에 명시된 에이전트/툴명(헤르메스·Claude Code 등)은 소분류에 반드시 포함.

## 예제
제목: Messages - Anthropic API → {"tags":[{"tag":"AI/ML","confidence":0.95},{"tag":"공식문서","confidence":0.85},{"tag":"Claude","confidence":0.8}]}
제목: Dense Passage Retrieval 논문 / URL: arxiv.org → {"tags":[{"tag":"AI/ML","confidence":0.9},{"tag":"논문","confidence":0.85},{"tag":"RAG","confidence":0.8}]}
제목: OpenCV Tutorials / URL: docs.opencv.org → {"tags":[{"tag":"AI/ML","confidence":0.9},{"tag":"공식문서","confidence":0.85},{"tag":"OpenCV","confidence":0.8}]}
제목: How I use Claude Code (Senior Software Engineer Tips) → {"tags":[{"tag":"AI/ML","confidence":0.9},{"tag":"강의","confidence":0.8},{"tag":"Claude Code","confidence":0.85}]}
제목: 헤르메스 에이전트 20분 완벽 세팅법 A to Z → {"tags":[{"tag":"AI/ML","confidence":0.9},{"tag":"강의","confidence":0.85},{"tag":"헤르메스","confidence":0.85}]}
제목: 맥미니 사지 마세요 | n8n으로 끝내는 AI GitHub 에이전트 (1일 1커밋 자동화) → {"tags":[{"tag":"개발","confidence":0.9},{"tag":"강의","confidence":0.8},{"tag":"n8n","confidence":0.85}]}
제목: ChatGPT / URL: chat.openai.com → {"tags":[{"tag":"AI/ML","confidence":0.9},{"tag":"도구","confidence":0.85},{"tag":"ChatGPT","confidence":0.85}]}
제목: React useState 15분 완성 / URL: youtube.com/watch → {"tags":[{"tag":"개발","confidence":0.9},{"tag":"강의","confidence":0.85},{"tag":"React","confidence":0.85}]}
제목: Next.js 풀스택 완주반 (30강 커리큘럼) → {"tags":[{"tag":"학습","confidence":0.9},{"tag":"강의","confidence":0.85},{"tag":"Next.js","confidence":0.8}]}
제목: 프롱트 frongt / URL: youtube.com/@frongt (프론트엔드 개발 강의 채널) → {"tags":[{"tag":"개발","confidence":0.9},{"tag":"강의","confidence":0.8},{"tag":"프론트엔드","confidence":0.75}]}
제목: 토스 기술 블로그 / URL: toss.tech → {"tags":[{"tag":"개발","confidence":0.9},{"tag":"아티클","confidence":0.8}]}
제목: 기능을 구현하는 단계(서비스 구체화)에서 가장 중요한 기준?! / URL: youtube.com/watch → {"tags":[{"tag":"비즈니스","confidence":0.85},{"tag":"강의","confidence":0.75}]}
제목: 요즘IT 매거진 / URL: yozm.wishket.com → {"tags":[{"tag":"콘텐츠","confidence":0.85},{"tag":"아티클","confidence":0.8}]}
제목: 뉴스레터 어피티 / URL: uppity.co.kr → {"tags":[{"tag":"콘텐츠","confidence":0.9},{"tag":"뉴스레터","confidence":0.85}]}
제목: feedly / URL: feedly.com (RSS 리더) → {"tags":[{"tag":"콘텐츠","confidence":0.85},{"tag":"큐레이션","confidence":0.8}]}
제목: Unsplash / URL: unsplash.com (무료 이미지) → {"tags":[{"tag":"디자인","confidence":0.85},{"tag":"큐레이션","confidence":0.8}]}
제목: awesome / URL: github.com/sindresorhus/awesome → {"tags":[{"tag":"개발","confidence":0.9},{"tag":"큐레이션","confidence":0.8}]}
제목: 사람인 / URL: saramin.co.kr → {"tags":[{"tag":"비즈니스","confidence":0.85},{"tag":"도구","confidence":0.75},{"tag":"사람인","confidence":0.8}]}
제목: 공공데이터포털 / URL: data.go.kr → {"tags":[{"tag":"비즈니스","confidence":0.85},{"tag":"도구","confidence":0.75},{"tag":"공공데이터포털","confidence":0.8}]}
제목: 홈택스 연말정산 간소화 / URL: hometax.go.kr → {"tags":[{"tag":"금융","confidence":0.85},{"tag":"세금","confidence":0.8}]}
제목: r/webdev - Reddit → {"tags":[{"tag":"커뮤니티","confidence":0.9},{"tag":"포럼","confidence":0.85},{"tag":"Reddit","confidence":0.85}]}
제목: 인벤 - 게임 그 이상을 추구하다 / URL: inven.co.kr → {"tags":[{"tag":"게임","confidence":0.85},{"tag":"포럼","confidence":0.8}]}
제목: 발로란트 신규 요원 공략 - 게임메카 → {"tags":[{"tag":"게임","confidence":0.9},{"tag":"공략","confidence":0.85},{"tag":"발로란트","confidence":0.85}]}
제목: Nike. Just Do It 브랜드 캠페인 → {"tags":[{"tag":"브랜드","confidence":0.9},{"tag":"마케팅","confidence":0.85},{"tag":"Nike","confidence":0.85}]}
제목: 스튜디오 디자인 에이전시 회사 소개 / URL: some-studio.com → {"tags":[{"tag":"브랜드","confidence":0.8},{"tag":"마케팅","confidence":0.75}]}
제목: Buy MacBook Pro - Apple → {"tags":[{"tag":"쇼핑","confidence":0.95},{"tag":"전자기기","confidence":0.9}]}
제목: 된장찌개 끓이는 법 황금레시피 → {"tags":[{"tag":"라이프스타일","confidence":0.9},{"tag":"요리","confidence":0.85}]}
제목: 제주 호텔 예약 / URL: yanolja.com → {"tags":[{"tag":"여행","confidence":0.9},{"tag":"숙소","confidence":0.85}]}
제목: 전월세 매물 시세 - 네이버부동산 → {"tags":[{"tag":"금융","confidence":0.9},{"tag":"부동산","confidence":0.85}]}
제목: NewJeans - Supernatural M/V / URL: youtube.com/watch → {"tags":[]}
제목: 이지금 [IU Official] / URL: youtube.com/@iu.official (가수 공식 채널) → {"tags":[]}
제목: 제2형 당뇨병 증상과 치료 - 서울아산병원 → {"tags":[]}
제목: 대법원 형사 판례 해설 — 정당방위 성립 요건 → {"tags":[]}

## 출력
JSON만 반환. 설명 없음. 각 태그에 0~1 confidence 부여 — 확신 없으면 낮게, 추측이면 0.5 미만.
{"tags": [{"tag": "대분류", "confidence": 0.95}, {"tag": "중분류", "confidence": 0.8}, {"tag": "소분류", "confidence": 0.7}]}`;

// confidence 미만 태그는 자동 적용 안 함 — 정밀도 우선.
// ponytail: 고정 임계값. 사용자 수정 통계 쌓이면 조정.
const CONFIDENCE_THRESHOLD = 0.6;

// 프롬프트 지시어(예: 과거 "0태그" 표기)를 모델이 문자 그대로 태그로 뱉는 경우 방어.
// 프롬프트를 명확히 고쳐도 LLM 출력은 결정적이지 않으므로 최종 방어선을 남긴다.
const REJECTED_TAGS = new Set(["0태그"]);

interface ScoredTag {
  tag: string;
  confidence: number;
}

// OpenAI 응답에서 confidence 임계값 이상 태그만 추출. 형식 깨지면 빈 배열로 degrade.
export function selectConfidentTags(raw: unknown): string[] {
  const items = (raw as { tags?: unknown })?.tags;
  if (!Array.isArray(items)) return [];
  return (
    items
      .filter(
        (i): i is ScoredTag =>
          i != null &&
          typeof i.tag === "string" &&
          i.tag.trim().length > 0 && // 빈 문자열·공백 태그 차단 (DB 오염 방지)
          !REJECTED_TAGS.has(i.tag.trim()) &&
          typeof i.confidence === "number" &&
          i.confidence >= CONFIDENCE_THRESHOLD,
      )
      // trim 반환 — 필터는 trim 기준으로 통과시키면서 원본(공백 포함)을 반환하면
      // 이후 TOP_CATEGORIES/alias 정확일치가 깨진다(방어선 불일치).
      .map((i) => i.tag.trim())
      .slice(0, 3)
  );
}

interface TaggingInput {
  title: string;
  url: string;
  description?: string;
}

export async function generateTags({ title, url, description }: TaggingInput): Promise<string[]> {
  if (isMockOpenAI()) return ["개발", "프론트엔드", "테스트"];

  const userContent = [`제목: ${title}`, `URL: ${url}`, description ? `설명: ${description}` : null]
    .filter(Boolean)
    .join("\n");

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
    max_tokens: 200, // confidence 필드 추가로 응답 길이 증가 — truncation 방지
    temperature: 0, // 분류 작업 — 같은 URL은 같은 태그(결정성). eval 변동성도 축소.
  });

  // truncation 등으로 JSON.parse 실패 시 빈 태그로 degrade.
  try {
    return selectConfidentTags(JSON.parse(completion.choices[0].message.content ?? "{}"));
  } catch {
    return [];
  }
}

// weak-vector 보강 — content(본문) 없을 때 태그·요약을 임베딩에 포함.
// title이 고유명사뿐이면("옵시디언") 기능 서술 쿼리("글쓰기 노트 앱")와 어휘 갭으로 검색 전멸(search-golden weak-vector 실측 0/3).
// 태그만으론 부족 실측(여전히 0/3) — LLM 한 줄 요약 추가.
export function buildWeakEmbeddingText(title: string, tags: string[], summary = ""): string {
  return [title, summary || null, tags.length > 0 ? `태그: ${tags.join(", ")}` : null]
    .filter(Boolean)
    .join("\n");
}

// weak 경로 전용 — 페이지가 뭔지 모델 사전지식으로 한 줄 서술(임베딩 어휘 갭 브릿지).
// 모르는 페이지 환각 방지: 확실치 않으면 빈 문자열 지시. 실패는 빈 문자열 degrade(저장 차단 금지).
export async function generateWeakSummary({ title, url }: { title: string; url: string }): Promise<string> {
  if (isMockOpenAI()) return "";
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            'URL과 제목만 보고 이 웹페이지/서비스가 무엇인지 확실히 아는 경우에만 기능 중심 한 문장(30자 내외)으로 설명하세요. 확실하지 않으면 빈 문자열. JSON만 반환: {"summary": "..."}',
        },
        { role: "user", content: `제목: ${title}\nURL: ${url}` },
      ],
      response_format: { type: "json_object" },
      max_tokens: 100,
      temperature: 0,
    });
    const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
    return typeof parsed.summary === "string" ? parsed.summary : "";
  } catch {
    return "";
  }
}

// 2026-07-22 3-small → 3-large 전환 (A/B 실측: recall@10 0.70→0.85, MRR 0.52→0.68, weak쌍 2/3 floor 구제).
// dimensions: 1536 — 3-large 기본 3072를 축소 출력해 기존 vector(1536) 스키마·인덱스 유지.
// 주의: 모델 변경 시 저장된 임베딩 전량 재생성 필수(scripts/reembed.ts) — 모델 간 벡터 공간 비호환.
export const EMBEDDING_MODEL = "text-embedding-3-large";
export const EMBEDDING_DIMENSIONS = 1536;

export async function createEmbedding(text: string): Promise<number[]> {
  if (isMockOpenAI()) return MOCK_EMBEDDING;

  const response = await getOpenAI().embeddings.create({
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    input: text,
  });
  return response.data[0].embedding;
}
