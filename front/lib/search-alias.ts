// 브랜드/툴명 음차 사전 — 검색 쿼리 확장용. 운영 중 누락 발견 시 추가.
// 임베딩 모델이 음차 표기(피그마)와 원어(Figma)를 교차언어로 강하게 연결 못 함 — 쿼리를 원어까지 확장해 검색한다.
// 실측 2026-07-27 (text-embedding-3-large, 라이브 match_bookmarks, n=1039):
// 원어 표기만 있고 한글 음차가 병존하지 않는 "순수 교차언어" 북마크 기준, 검증 가능한 31개 키 중
// 16개가 음차 쿼리만으로는 top-10 실패(14개는 top-60 미진입: 피그마·노션·슬랙·지라·커서·리액트 등,
// 클로드 코드 rank 12 / 클로드 rank 30). 원어 확장 시 전부 top-3 진입.
// 주의: 같은 문서에 한글·원어가 병존하면 trigram이 잡아 alias 없이도 걸린다 — 그 케이스를 대상에
// 포함하면 "alias 불필요"로 잘못 보인다(2026-07-22 3-large 전환 후 재검토 시 실제 발생).
export const SEARCH_ALIAS: Record<string, string> = {
  피그마: 'Figma',
  유튜브: 'YouTube',
  노션: 'Notion',
  슬랙: 'Slack',
  깃허브: 'GitHub',
  지라: 'Jira',
  피피티: 'PowerPoint',
  포토샵: 'Photoshop',
  일러스트: 'Illustrator',
  스프레드시트: 'Spreadsheet',
  코덱스: 'Codex',
  클로드코드: 'Claude Code',
  '클로드 코드': 'Claude Code',
  클로드: 'Claude',
  커서: 'Cursor',
  옵시디언: 'Obsidian',
  옵시디안: 'Obsidian',
  헤르메스: 'Hermes Agent',
  에르메스: 'Hermes Agent',
  자바스크립트: 'JavaScript',
  리액트: 'React',
  제미나이: 'Gemini',
  미드저니: 'Midjourney',
  '안드레 카파시': 'Andrej Karpathy',
  컬리: 'Kurly',
  테일윈드: 'Tailwind',
  넥스트: 'Next.js',
  포스트그레스: 'PostgreSQL',
  챗지피티: 'ChatGPT',
  챗GPT: 'ChatGPT',
  나노바나나: 'Nano Banana',
  '나노 바나나': 'Nano Banana',
  프레이머: 'Framer',
  파이썬: 'Python',
  인스타그램: 'Instagram',
  인스타: 'Instagram',
  링크드인: 'LinkedIn',
  브루: 'Vrew',
  마켓컬리: 'Kurly',
  제로초: 'ZeroCho',
  하네스엔지니어링: 'Harness Engineering',
  // 역방향 대비 — 북마크는 한글 표기만 있고 원어가 없는 브랜드. 사용자가 영문으로 검색하면
  // reverse 조회가 한글 표기까지 확장해 잡는다(실측 대상 문서가 없어 rank 측정은 불가).
  필모라: 'Filmora',
  뤼튼: 'Wrtn',
  클로바노트: 'CLOVA Note',
  스트림릿: 'Streamlit',
  티스토리: 'Tistory',
  미리캔버스: 'MiriCanvas',
  카카오: 'Kakao',
  토스: 'Toss',
  아마존: 'Amazon',
}

// 대화형 쿼리 노이즈 토큰 — 시간참조·지시어·행위어("지난달 저장한 그 pgvector 아티클").
// 판별 신호가 없는데 임베딩 벡터를 희석해 relevance floor 미달 유발(search-golden conversational 실측 2/8).
// ponytail: 시간참조는 v1에서 필터가 아닌 제거로 처리 — created_at 하드 필터는 사용자 기억
// 오차(지난달≠정확한 달력 월)로 정답을 배제할 위험이 있어 recall 하락 실측 후 재검토.
const NOISE_TOKENS = new Set([
  // 시간참조
  '지난달', '지난주', '지난해', '지난달에', '지난주에', '어제', '그저께', '그때', '아까',
  '저번에', '저번주에', '저번달에', '얼마', '전', '전에', '예전에', '일전에', '최근', '최근에',
  // 지시어
  '그', '저', '이', '그거', '저거',
  // 행위어 (본=열람은 created_at 근사 — 시나리오3 보류)
  '본', '봤던', '봤었던', '보았던', '읽은', '읽었던', '저장한', '저장했던', '북마크한', '올렸던',
])

// 노이즈 토큰 제거. 전부 노이즈면 원문 유지(빈 쿼리 → createEmbedding('') 방지).
export function stripConversationalNoise(query: string): string {
  const kept = query.trim().split(/\s+/).filter((t) => !NOISE_TOKENS.has(t))
  return kept.length === 0 ? query.trim() : kept.join(' ')
}

export function expandSearchQuery(query: string): string[] {
  const trimmed = stripConversationalNoise(query)
  const direct = SEARCH_ALIAS[trimmed]
  if (direct) return [trimmed, direct]

  const reverseEntry = Object.entries(SEARCH_ALIAS).find(
    ([, en]) => en.toLowerCase() === trimmed.toLowerCase(),
  )
  if (reverseEntry) return [trimmed, reverseEntry[0]]

  // 문장 속 브랜드 토큰 치환 변형 — "테일윈드 설치 문서" → "Tailwind 설치 문서".
  // 전체 일치 확장(위)은 단독 브랜드 쿼리만 커버 — 대화형 문장 쿼리 보강.
  const tokens = trimmed.split(/\s+/)
  const replaced = tokens.map((t) => resolveBrandToken(t) ?? t).join(' ')
  if (replaced !== trimmed) return [trimmed, replaced]

  return [trimmed]
}

// 조사 붙은 브랜드 토큰("피그마로"·"리액트를") — 정확일치 실패 시 조사 제거 후 재조회.
// 무조건 절단이 아니라 제거 결과가 사전에 있을 때만 채택 — "한글로" 같은 일반어 오절단 방지.
const PARTICLE_SUFFIX = /(으로|에서|를|을|이|가|은|는|로|에|의)$/

function resolveBrandToken(token: string): string | null {
  if (SEARCH_ALIAS[token]) return SEARCH_ALIAS[token]
  const stripped = token.replace(PARTICLE_SUFFIX, '')
  return stripped !== token && SEARCH_ALIAS[stripped] ? SEARCH_ALIAS[stripped] : null
}

