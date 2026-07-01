// URL 표준 정규화 — 중복 북마크 방지용 canonical 형태.
// (user_id, url) unique 제약(A35)은 바이트 동일 문자열만 잡으므로,
// insert 전 이 함수로 정규화해 trailing slash·fragment·트래킹파라미터·쿼리순서 차이를 흡수한다.

// 의미 없는 추적용 쿼리 파라미터 — 페이지 식별에 무관해 제거해도 안전.
const TRACKING_PARAMS = new Set([
  'gclid',
  'fbclid',
  'igshid',
  'ref',
  'ref_src',
  'mc_cid',
  'mc_eid',
  'yclid',
  '_hsenc',
  '_hsmi',
])

// utm_* 계열은 접두어로 일괄 제거.
const isTracking = (key: string): boolean =>
  key.startsWith('utm_') || TRACKING_PARAMS.has(key)

export function normalizeUrl(input: string): string {
  let u: URL
  try {
    u = new URL(input) // protocol·host 소문자화, 기본 포트 제거는 URL이 자동 처리
  } catch {
    return input // schema(z.url)가 이미 검증 — 방어적 fallback
  }

  u.hash = '' // fragment 제거

  // 트래킹 파라미터 제거 + 남은 쿼리 키 정렬(순서 무관 동일 URL 처리)
  const kept = [...u.searchParams.entries()]
    .filter(([key]) => !isTracking(key))
    .sort(([a], [b]) => a.localeCompare(b))
  u.search = ''
  for (const [key, value] of kept) u.searchParams.append(key, value)

  // 말미 slash 제거 (루트 '/'는 유지)
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.slice(0, -1)
  }

  return u.toString()
}
