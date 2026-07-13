// 검색 품질 측정 (front/eval/search-golden.json 대비). RPC 결과 순위 기반 recall/MRR.
// 실행: lib/__tests__/search-eval.test.ts 하단 참조.

export interface SearchScore {
  // noise 카테고리(expected_refs=[])는 반대로 채점: 결과가 비어 있어야 hit.
  hit: boolean
  recall: number // |actual ∩ expected| / |expected|. noise면 결과 없음=1, 있으면=0.
  reciprocalRank: number // 1/(첫 hit 순위). 못 찾으면 0.
}

// actualRefs: RPC 결과를 순위대로 골든 bookmark ref로 매핑한 배열.
// expectedRefs: 골든셋 정답. 빈 배열이면 noise 케이스(정답 = 결과 없음).
export function scoreQuery(actualRefs: string[], expectedRefs: string[]): SearchScore {
  if (expectedRefs.length === 0) {
    const empty = actualRefs.length === 0
    return { hit: empty, recall: empty ? 1 : 0, reciprocalRank: empty ? 1 : 0 }
  }

  const hitIndex = actualRefs.findIndex((ref) => expectedRefs.includes(ref))
  const hitCount = actualRefs.filter((ref) => expectedRefs.includes(ref)).length
  return {
    hit: hitIndex !== -1,
    recall: hitCount / expectedRefs.length,
    reciprocalRank: hitIndex === -1 ? 0 : 1 / (hitIndex + 1),
  }
}

export interface CategoryScore {
  n: number
  recall: number
  mrr: number
  hitRate: number
}

export interface AggregateSearchScore extends CategoryScore {
  byCategory: Record<string, CategoryScore>
}

// 쿼리별 점수 macro 평균 + 카테고리(exact/synonym/cross-lingual/weak-vector/tag-only/noise)별 분해.
export function aggregateSearch(
  items: Array<{ score: SearchScore; category: string }>,
): AggregateSearchScore {
  const avg = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((sum, x) => sum + x, 0) / xs.length)

  const byCategory: Record<string, CategoryScore> = {}
  for (const category of new Set(items.map((i) => i.category))) {
    const group = items.filter((i) => i.category === category)
    byCategory[category] = {
      n: group.length,
      recall: avg(group.map((i) => i.score.recall)),
      mrr: avg(group.map((i) => i.score.reciprocalRank)),
      hitRate: avg(group.map((i) => (i.score.hit ? 1 : 0))),
    }
  }

  return {
    n: items.length,
    recall: avg(items.map((i) => i.score.recall)),
    mrr: avg(items.map((i) => i.score.reciprocalRank)),
    hitRate: avg(items.map((i) => (i.score.hit ? 1 : 0))),
    byCategory,
  }
}
