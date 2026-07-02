// 태그 품질 측정 (시나리오 4). 골든셋 대비 precision/recall/F1.
// 프롬프트·임계값 변경 시 회귀 감지용. 실행: docs 하단 참조.
import { normalizeTags } from './tag-alias'

export interface TagScore {
  precision: number
  recall: number
  f1: number
  exact: boolean
  categoryHit: boolean // 대분류(tags[0]) 단독 일치 — 전체 F1과 별개 진단
  goldNonEmpty: boolean // gold에 태그가 있음(분류 대상). emptyRate 분모.
  miss: boolean // D-1: gold 있는데 예측 빈 태그 = 미분류 실패. emptyRate 분자.
}

// 예측·정답을 집합으로 비교. 둘 다 빈 태그(로그인·오류 페이지 정답)면 완벽 처리.
export function scoreTags(predicted: string[], gold: string[]): TagScore {
  const np = normalizeTags(predicted) // 프로덕션과 동일 정규화 적용
  const ng = normalizeTags(gold) // gold가 alias 형태여도 일치 처리
  const P = new Set(np)
  const G = new Set(ng)
  const inter = [...P].filter((t) => G.has(t)).length

  const precision = P.size === 0 ? (G.size === 0 ? 1 : 0) : inter / P.size
  const recall = G.size === 0 ? (P.size === 0 ? 1 : 0) : inter / G.size
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  const exact = P.size === G.size && inter === P.size
  // 대분류 = 정규화 후 첫 태그. 둘 다 미분류(빈 배열)면 일치로 처리.
  const categoryHit = (np[0] ?? null) === (ng[0] ?? null)
  // D-1 미분류 판정: gold는 태그를 요구하는데 예측이 빈 태그면 miss(순손실).
  // gold가 빈 경우(로그인 페이지 정답)는 분모에서 제외 — 빈 예측이 정답이라 miss 아님.
  const goldNonEmpty = G.size > 0
  const miss = goldNonEmpty && P.size === 0

  return { precision, recall, f1, exact, categoryHit, goldNonEmpty, miss }
}

export interface AggregateScore {
  n: number
  precision: number
  recall: number
  f1: number
  exactMatchRate: number
  categoryAccuracy: number // 대분류 정확도 = categoryHit 비율
  emptyRate: number // D-1: 미분류율 = gold 있는 항목 중 예측 빈 비율. F1이 못 잡는 태그 삭제 회귀 감시.
}

// 항목별 점수 macro 평균.
export function aggregate(scores: TagScore[]): AggregateScore {
  const n = scores.length
  const avg = (sel: (s: TagScore) => number) =>
    n === 0 ? 0 : scores.reduce((sum, s) => sum + sel(s), 0) / n
  // emptyRate 분모 = gold 있는 항목만. 없으면 0으로 degrade.
  const goldNonEmptyCount = scores.filter((s) => s.goldNonEmpty).length
  return {
    n,
    precision: avg((s) => s.precision),
    recall: avg((s) => s.recall),
    f1: avg((s) => s.f1),
    exactMatchRate: n === 0 ? 0 : scores.filter((s) => s.exact).length / n,
    categoryAccuracy: n === 0 ? 0 : scores.filter((s) => s.categoryHit).length / n,
    emptyRate:
      goldNonEmptyCount === 0 ? 0 : scores.filter((s) => s.miss).length / goldNonEmptyCount,
  }
}
