// 관리자 대시보드 익명 사용자 라벨(U1·U2·기타) 단일 출처.
// 위젯마다 따로 랭킹하면 "비용 U1"과 "활동 U1"이 다른 사람이 돼 나란히 읽을 때 오독한다.
// → 랭킹 기준을 추정 비용 하나로 고정하고, 창(56일)도 위젯 range와 분리해 user_id → 라벨 매핑을 공유한다.

export const COST_PER_SAVE_USD = 0.00065
export const COST_PER_SEARCH_USD = 0.00002

export const OTHER_LABEL = '기타'
// 실명 라벨 수 — 넘어가면 '기타'로 합산 (고정 2색 도트 전제)
const NAMED_LABEL_COUNT = 2

// 라벨 랭킹 창. 위젯 range(1d/7d/30d)와 무관하게 고정 — range를 바꿔도 U1이 같은 사람을 가리키도록.
// 8주 지표 위젯과 같은 폭(56일). ponytail: 라우트별 now가 최대 15분(캐시 버킷) 어긋나 경계 이벤트로
// 순위가 뒤집힐 여지는 남긴다 — 실제로 문제되면 라벨 매핑을 RPC/뷰로 승격.
export const LABEL_WINDOW_DAYS = 56

// 비용 랭킹 입력이 되는 이벤트 타입
export const COST_EVENT_TYPES = ['bookmark_saved', 'search_performed'] as const

// 도트 시리즈 고정 색 — validate_palette.js 통과(CVD ΔE 24.1 · normal 29.4).
// '기타'는 중립 회색(범주 아님, 잔여 합산). 색은 순서가 아니라 키에 고정.
export const DOT_COLORS: Record<string, string> = {
  U1: '#4a90e2',
  U2: '#e8833a',
  [OTHER_LABEL]: '#9aa0a8',
}

export function dotColor(user: string): string {
  return DOT_COLORS[user] ?? DOT_COLORS[OTHER_LABEL]
}

// 라벨 정렬 순서 (U1 → U2 → 기타)
export function labelOrder(user: string): number {
  return user === OTHER_LABEL ? NAMED_LABEL_COUNT : Number(user.slice(1)) - 1
}

export type CostEvent = { user_id: string; type: string }

export function estimateCostUsd(saves: number, searches: number): number {
  return saves * COST_PER_SAVE_USD + searches * COST_PER_SEARCH_USD
}

export function costOfEvent(type: string): number {
  return type === 'bookmark_saved' ? COST_PER_SAVE_USD : COST_PER_SEARCH_USD
}

// user_id → 익명 라벨. 비용 내림차순, 동률은 user_id 오름차순으로 결정론적 처리.
export function labelUsersByCost(events: readonly CostEvent[]): Map<string, string> {
  const costByUser = new Map<string, number>()
  for (const e of events) {
    costByUser.set(e.user_id, (costByUser.get(e.user_id) ?? 0) + costOfEvent(e.type))
  }
  const ranked = [...costByUser.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return new Map(
    ranked.map(([userId], i) => [userId, i < NAMED_LABEL_COUNT ? `U${i + 1}` : OTHER_LABEL]),
  )
}

// 라벨 창 밖의 사용자(신규·저활동)는 '기타'로 흡수
export function labelOf(labels: ReadonlyMap<string, string>, userId: string): string {
  return labels.get(userId) ?? OTHER_LABEL
}
