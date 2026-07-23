import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { scoreQuery, aggregateSearch, type SearchScore } from '../search-eval'
import { createEmbedding, buildWeakEmbeddingText, generateWeakSummary } from '../ai'
import { expandSearchQuery } from '../search-alias'

// 지표 함수 단위 테스트 — 항상 실행 (OpenAI/DB 미호출).
describe('scoreQuery', () => {
  it('1순위 히트 → recall=1, reciprocalRank=1', () => {
    expect(scoreQuery(['b1', 'b2'], ['b1'])).toEqual({ hit: true, recall: 1, reciprocalRank: 1 })
  })

  it('2순위 히트 → reciprocalRank=0.5', () => {
    expect(scoreQuery(['b2', 'b1'], ['b1'])).toMatchObject({ hit: true, reciprocalRank: 0.5 })
  })

  it('미발견 → recall=0, reciprocalRank=0', () => {
    expect(scoreQuery(['b2', 'b3'], ['b1'])).toEqual({ hit: false, recall: 0, reciprocalRank: 0 })
  })

  it('expected 다건 중 일부만 히트 → recall 부분 점수', () => {
    const s = scoreQuery(['b1', 'b3'], ['b1', 'b2'])
    expect(s.recall).toBe(0.5)
    expect(s.hit).toBe(true)
  })

  it('noise 카테고리(expected=[]) — 결과 없음 = 정답', () => {
    expect(scoreQuery([], [])).toEqual({ hit: true, recall: 1, reciprocalRank: 1 })
  })

  it('noise 카테고리 — 결과 있으면 오답(false positive)', () => {
    expect(scoreQuery(['b9'], [])).toEqual({ hit: false, recall: 0, reciprocalRank: 0 })
  })
})

describe('aggregateSearch', () => {
  it('macro 평균 + 카테고리별 분해', () => {
    const items = [
      { score: scoreQuery(['b1'], ['b1']), category: 'exact' },
      { score: scoreQuery(['b2'], ['b1']), category: 'exact' },
      { score: scoreQuery([], []), category: 'noise' },
    ]
    const agg = aggregateSearch(items)
    expect(agg.n).toBe(3)
    expect(agg.recall).toBeCloseTo(2 / 3)
    expect(agg.byCategory.exact).toMatchObject({ n: 2, recall: 0.5 })
    expect(agg.byCategory.noise).toMatchObject({ n: 1, recall: 1 })
  })

  it('빈 배열 → 전부 0 (0 나눗셈 방지)', () => {
    expect(aggregateSearch([])).toMatchObject({ n: 0, recall: 0, mrr: 0, hitRate: 0 })
  })
})

// 실 Supabase+OpenAI 골든셋 평가 — 비용·DB 쓰기 때문에 RUN_SEARCH_EVAL=1에서만.
// 실행: RUN_SEARCH_EVAL=1 npx vitest run lib/__tests__/search-eval.test.ts
// 필요 env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
// 흐름: 골든셋(front/eval/search-golden.json) 전용 throwaway auth user 생성 →
//   북마크 18건 삽입(title+description 임베딩, front/lib/ai.ts:171과 동일 규약) →
//   쿼리 12건에 대해 app/api/search/route.ts와 동일한 하이브리드 검색(expandSearchQuery
//   교차언어 확장 → match_bookmarks RPC 병렬 호출 → similarity 기준 병합/정렬) 재현 →
//   scoreQuery로 채점 → finally에서 북마크·테스트 유저 삭제.
// 실측(2026-07-13, text-embedding-3-small, n=12): recall=mrr=hitRate=0.917(11/12).
// exact/synonym/cross-lingual/tag-only/noise 전부 1.0. weak-vector만 0(known limitation —
// description 없는 북마크는 title-only 임베딩이라 의미 검색 재현 안 됨, front/lib/ai.ts:171 구조적 한계,
// 회귀 아님). baseline은 weak-vector 실패를 전제로 잡되 그 외 카테고리 하락은 잡도록 마진 둠.
// N-2(2026-07-15): weak-vector 표본 1→3건 확대(b19 옵시디언·b20 Zotero, 고유명사 title-only↔기능형 쿼리 어휘갭).
// n=12→14. weak-vector 전건 miss 최악 시 non-weak 11/14=0.786 → overall baseline 0.83→0.75 재보정.
// 회귀 아니라 알려진 약점 표본 증가에 따른 분모 확대(태깅 골든셋 0.82→0.76과 동일 논리).
// 진짜 품질 게이트는 NON_WEAK_VECTOR_RECALL_BASELINE(weak-vector 제외 0.90) — 그대로 유지.
// N-3(2026-07-22): conversational 8건 추가(시간참조·지시어·행위어 쿼리). 도입 시 실측 0.25(2/8) →
// stripConversationalNoise + 토큰 단위 브랜드 치환(search-alias.ts) 후 1.0(8/8). 게이트 정식 편입.
// N-4(2026-07-22): particle 4건 추가(조사 변형). 도입 시 0.5(2/4) → 조사 제거 alias fallback 후 0.75(3/4).
// 잔여 1건("리액트를 처음 배울 때 본 문서"↔useEffect 레퍼런스)은 라벨 자체가 느슨한 known miss.
// weak-vector도 임베딩 태그·요약 보강으로 코사인 0.23→0.43(2배)까지 올렸으나 floor 0.5 미달 지속 —
// 3-small 분리력 한계(노이즈 밴드 0.3~0.48와 겹침), 모델 A/B 대상.
// N-5(2026-07-22): 임베딩 모델 3-large(dimensions:1536) 전환 + 전량 재임베딩(1000건, 실패 0).
// weak-vector 0/3→2/3(옵시디언·Zotero floor 통과 — A/B 예측 적중), noise 오탐 0 유지. 실측 24/26=0.923.
// n=26. 최악(weak 1 + particle 1 miss) 24/26=0.923 − 마진.
const OVERALL_RECALL_BASELINE = 0.85
const NON_WEAK_VECTOR_RECALL_BASELINE = 0.9 // weak-vector 제외 실측 1.0 − 마진
interface GoldenBookmark {
  ref: string
  url: string
  title: string
  description: string
  tags: string[]
}
interface GoldenQuery {
  query: string
  expected_refs: string[]
  category: string
  note?: string
}
interface GoldenSet {
  categories: string[]
  bookmarks: GoldenBookmark[]
  queries: GoldenQuery[]
}

function loadGolden(): GoldenSet {
  return JSON.parse(readFileSync(join(__dirname, '../../eval/search-golden.json'), 'utf-8'))
}

const SEARCH_TOP_K = 60 // app/api/search/route.ts와 동일 값

async function runSearchGolden(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  golden: GoldenSet,
): Promise<{ agg: ReturnType<typeof aggregateSearch>; userId: string }> {
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: `search-eval-${Date.now()}@example.invalid`,
    password: crypto.randomUUID(),
    email_confirm: true,
  })
  if (createErr || !created.user) throw new Error(`테스트 유저 생성 실패: ${createErr?.message}`)
  const userId = created.user.id

  const refToId = new Map<string, string>()
  const idToRef = new Map<string, string>()

  try {
    for (const b of golden.bookmarks) {
      // 프로덕션 규약 미러: description(content 대역) 있으면 title+description,
      // 없으면 weak 경로(title+LLM 한줄요약+태그) — app/api/bookmarks/route.ts와 동일.
      const embedding = await createEmbedding(
        b.description
          ? `${b.title}\n${b.description}`
          : buildWeakEmbeddingText(b.title, b.tags, await generateWeakSummary({ title: b.title, url: b.url })),
      )
      const { data, error } = await supabase
        .from('bookmarks')
        .insert({ user_id: userId, url: b.url, title: b.title, description: b.description, tags: b.tags, embedding })
        .select('id')
        .single()
      if (error || !data) throw new Error(`골든 북마크 삽입 실패(${b.ref}): ${error?.message}`)
      refToId.set(b.ref, (data as { id: string }).id)
      idToRef.set((data as { id: string }).id, b.ref)
    }

    const scored: Array<{ score: SearchScore; category: string }> = []
    for (const q of golden.queries) {
      const expansions = expandSearchQuery(q.query)
      const rpcResults = await Promise.all(
        expansions.map(async (expanded) => {
          const embedding = await createEmbedding(expanded)
          // DB에 match_bookmarks 오버로드가 2개(구버전 6-param, 현재 8-param) 있어
          // 뒤 두 파라미터를 생략하면 함수 선택이 모호해짐 — route.ts처럼 전부 명시.
          return supabase.rpc('match_bookmarks', {
            query_embedding: embedding,
            query_text: expanded,
            match_count: SEARCH_TOP_K,
            p_user_id: userId,
            p_category_id: null,
            p_uncategorized: false,
            p_tags: null,
            p_is_favorite: null,
          })
        }),
      )
      const failed = rpcResults.find((r) => r.error)
      if (failed?.error) throw new Error(`match_bookmarks 실패("${q.query}"): ${failed.error.message}`)

      const merged = new Map<string, number>()
      for (const { data } of rpcResults) {
        for (const row of (data ?? []) as Array<{ id: string; similarity: number }>) {
          const prev = merged.get(row.id)
          if (prev === undefined || row.similarity > prev) merged.set(row.id, row.similarity)
        }
      }
      const actualRefs = [...merged.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, SEARCH_TOP_K)
        .map(([id]) => idToRef.get(id))
        .filter((ref): ref is string => ref !== undefined)

      const score = scoreQuery(actualRefs, q.expected_refs)
      scored.push({ score, category: q.category })
      console.log(
        `[${q.category}] hit=${score.hit} recall=${score.recall.toFixed(2)} rr=${score.reciprocalRank.toFixed(2)} | "${q.query}" | expected=[${q.expected_refs}] actual=[${actualRefs.slice(0, 5)}]`,
      )
    }

    return { agg: aggregateSearch(scored), userId }
  } finally {
    const ids = [...refToId.values()]
    if (ids.length > 0) await supabase.from('bookmarks').delete().in('id', ids)
    await supabase.auth.admin.deleteUser(userId)
  }
}

describe.runIf(process.env.RUN_SEARCH_EVAL === '1')('골든셋 평가 (실 Supabase+OpenAI)', () => {
  it(
    '검색 골든셋 recall/MRR 리포트',
    async () => {
      expect(process.env.E2E_MOCK_OPENAI, 'RUN_SEARCH_EVAL과 E2E_MOCK_OPENAI 동시 설정 불가').not.toBe('1')

      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      )

      const { agg } = await runSearchGolden(supabase, loadGolden())
      console.log('\n=== 집계 ===', JSON.stringify(agg, null, 2))

      expect(agg.n).toBe(loadGolden().queries.length)
      expect(agg.recall).toBeGreaterThanOrEqual(OVERALL_RECALL_BASELINE)

      const nonWeakVector = Object.entries(agg.byCategory)
        .filter(([category]) => category !== 'weak-vector')
        .map(([, score]) => score)
      const nonWeakVectorRecall =
        nonWeakVector.reduce((sum, s) => sum + s.recall * s.n, 0) /
        nonWeakVector.reduce((sum, s) => sum + s.n, 0)
      expect(nonWeakVectorRecall).toBeGreaterThanOrEqual(NON_WEAK_VECTOR_RECALL_BASELINE)
    },
    120_000,
  )
})
