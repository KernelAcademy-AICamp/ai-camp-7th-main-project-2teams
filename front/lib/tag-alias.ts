// AI 태깅 출력 정규화 (docs/specs/alias.md). 운영 중 누락 발견 시 추가.

// 대분류 alias — categories 테이블 name 매핑. 고정 13개(TOP_CATEGORIES) 외 값은 null(미분류).
export const CATEGORY_ALIAS: Record<string, string> = {
  // 개발
  dev: '개발', development: '개발', programming: '개발',
  프로그래밍: '개발', 코딩: '개발', coding: '개발', software: '개발',

  // AI/ML
  AI: 'AI/ML', ML: 'AI/ML', 인공지능: 'AI/ML',
  머신러닝: 'AI/ML', 딥러닝: 'AI/ML',
  'machine learning': 'AI/ML', 'deep learning': 'AI/ML',

  // 디자인
  design: '디자인', UI: '디자인', UX: '디자인',
  graphic: '디자인', 그래픽: '디자인',

  // 비즈니스
  business: '비즈니스', 경영: '비즈니스', management: '비즈니스',

  // 학습
  learning: '학습', education: '학습', 교육: '학습',
  공부: '학습', study: '학습',

  // 쇼핑
  shopping: '쇼핑', 구매: '쇼핑', buy: '쇼핑',

  // 커뮤니티 (자기참조 제외 — normalizeTags fallthrough로 동일)
  community: '커뮤니티', 소셜: '커뮤니티', social: '커뮤니티',

  // 브랜드
  brand: '브랜드',

  // 게임
  game: '게임', gaming: '게임', 비디오게임: '게임',

  // 라이프스타일
  lifestyle: '라이프스타일', 라이프: '라이프스타일',

  // 여행
  travel: '여행', trip: '여행',

  // 금융
  finance: '금융', 재테크: '금융', 금융재테크: '금융',
}

// 중분류 alias — tags 배열 정규화용. 소분류는 자유 텍스트 — alias 없음.
export const TAG_ALIAS: Record<string, string> = {
  // 프론트엔드
  frontend: '프론트엔드', 'front-end': '프론트엔드', FE: '프론트엔드', 프론트: '프론트엔드',
  // 백엔드
  backend: '백엔드', 'back-end': '백엔드', BE: '백엔드', 서버: '백엔드', server: '백엔드',
  // 인프라 (배포·클라우드 표현 흡수 — 전부 인프라 중분류로)
  infra: '인프라', infrastructure: '인프라', DevOps: '인프라', devops: '인프라', 'CI/CD': '인프라',
  컨테이너: '인프라', container: '인프라', 클라우드네이티브: '인프라', 'cloud native': '인프라',
  배포: '인프라', deploy: '인프라', deployment: '인프라', 클라우드: '인프라', cloud: '인프라',
  // 데이터베이스
  DB: '데이터베이스', database: '데이터베이스', db: '데이터베이스',
  // LLM
  llm: 'LLM', 'large language model': 'LLM',
  // RAG
  rag: 'RAG', 검색증강생성: 'RAG',
  'Retrieval-Augmented Generation': 'RAG', 'retrieval-augmented generation': 'RAG',
  // 프레임워크 소분류 표기 통일 (모델이 'Tailwind CSS' 등 풀네임 반환)
  'Tailwind CSS': 'Tailwind', tailwind: 'Tailwind',
  // 컴퓨터비전
  CV: '컴퓨터비전', 'computer vision': '컴퓨터비전', 비전: '컴퓨터비전',
  // MLOps
  mlops: 'MLOps', 'ml ops': 'MLOps',
  // UI/UX
  'ui/ux': 'UI/UX', ui: 'UI/UX', ux: 'UI/UX', 'UI 디자인': 'UI/UX', UI디자인: 'UI/UX',
  // 스타트업
  startup: '스타트업', 'start-up': '스타트업', 창업: '스타트업',
  // 커리어
  career: '커리어', 취업: '커리어', 이직: '커리어', job: '커리어', 채용: '커리어',
  // 강의
  lecture: '강의', course: '강의', tutorial: '강의', 튜토리얼: '강의', 코스: '강의',
  // 논문
  paper: '논문', research: '논문', 리서치: '논문',
  // 공식문서
  docs: '공식문서', documentation: '공식문서', reference: '공식문서', 레퍼런스: '공식문서',
  // 전자기기
  electronics: '전자기기', 전자제품: '전자기기', gadget: '전자기기',
  // 소프트웨어
  SaaS: '소프트웨어', saas: '소프트웨어', 협업툴: '소프트웨어', 협업도구: '소프트웨어',
  // 포럼 (커뮤니티)
  forum: '포럼', 게시판: '포럼', 'q&a': 'Q&A', qna: 'Q&A', 질문답변: 'Q&A',
  // 소셜미디어 (커뮤니티)
  sns: '소셜미디어', 'social media': '소셜미디어', 소셜미디어: '소셜미디어',
  // 마케팅·기업 (브랜드) — company/corporate는 범용어라 제외(개발 org 등 오분류 방지)
  marketing: '마케팅', 광고: '마케팅', 기업소개: '기업', 뉴스룸: '기업',
  // 게임 중분류 — 전부 bare(공략·e스포츠·리뷰·뉴스). 모델이 접두어판 뱉을 때 흡수.
  게임공략: '공략', esports: 'e스포츠', 'e-sports': 'e스포츠',
  게임리뷰: '리뷰', 게임뉴스: '뉴스',
  // 라이프스타일 중분류
  헬스: '운동', 피트니스: '운동', 홈트: '운동', workout: '운동',
  레시피: '요리', recipe: '요리', 쿠킹: '요리',
  홈데코: '인테리어', interior: '인테리어',
  // 여행 중분류
  호텔: '숙소', accommodation: '숙소', 항공권: '항공', flight: '항공',
  명소: '관광', 여행지: '관광', 관광지: '관광', restaurant: '맛집',
  // 금융 중분류
  전월세: '부동산', 부동산매물: '부동산', insurance: '보험',
  // 쇼핑 중분류 보강
  fashion: '패션', 의류: '패션', food: '식품', 식료품: '식품',
  // 학습 중분류 보강
  certificate: '자격증', certification: '자격증',
  // 보안 (인증=보안 중분류)
  인증: '보안', auth: '보안', authentication: '보안',
  // 기획 (제품관리=기획 중분류)
  제품관리: '기획', 프로덕트: '기획', 'product management': '기획',
  // 소분류 표기 통일
  파이썬: 'Python', 도커: 'Docker', 쿠버네티스: 'Kubernetes',
}

const TOP_CATEGORIES = new Set(['개발', 'AI/ML', '디자인', '비즈니스', '학습', '쇼핑', '커뮤니티', '콘텐츠', '브랜드', '게임', '라이프스타일', '여행', '금융'])

// 고정 13개 외 / 태깅 실패(tags=[]) → category_id null. UI·필터에서 이 라벨로 묶음.
export const UNCATEGORIZED_LABEL = '미분류'

export function normalizeTags(tags: string[]): string[] {
  return tags.map((t) => TAG_ALIAS[t] ?? CATEGORY_ALIAS[t] ?? t)
}

// 대분류명을 tags 배열 어느 위치에서든 추출·제거. tags는 중·소분류 전용으로 정제됨.
// 입력은 normalizeTags() 거친 배열. 재정규화하지 않음(중복 호출 방지).
// 대분류 토큰이 여러 개 섞여 있어도(예: normalizeTags가 'AI'→'AI/ML'로 바꿔 대분류가 중복 등장) 전부 제거 — 첫 번째만 지우면 나머지가 중분류 자리에 남는다.
export function extractTopCategory(normalizedTags: string[]): {
  category: string | null
  midTags: string[]
} {
  const idx = normalizedTags.findIndex((t) => TOP_CATEGORIES.has(t))
  if (idx === -1) return { category: null, midTags: normalizedTags }
  return {
    category: normalizedTags[idx],
    midTags: normalizedTags.filter((t) => !TOP_CATEGORIES.has(t)),
  }
}
