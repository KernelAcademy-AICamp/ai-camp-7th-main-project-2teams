import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseRange, RANGE_DAYS } from '@/lib/admin-range'

// 실사용 추정(청구액에서 개발·eval 비용 분리) — Costs API는 단일 프로젝트라 호출 주체 구분 불가.
// events 건수 × 단가로 프로덕션 사용분을 추정한다. 단가 근거:
//   저장 1건 = gpt-4o-mini 태깅(~2.7k in/$0.15 · ~0.2k out/$0.60 per 1M) + 3-large 임베딩(~1k/$0.13 per 1M) ≈ $0.00065
//   검색 1건 = 확장 쿼리 임베딩 2~3회 소량 토큰 ≈ $0.00002
// ponytail: 상수 추정 — 정밀 분리가 필요해지면 OpenAI 프로젝트 분리(prod/dev 키)로 승격.
const COST_PER_SAVE_USD = 0.00065
const COST_PER_SEARCH_USD = 0.00002

type EstimatedUsage = {
  productionCostUsd: number
  saves: number
  searches: number
  // user는 익명 키(U1·U2·기타, 비용 내림차순) — user_id 미노출
  perUser: Array<{ user: string; costUsd: number }>
}

type UsageResponse = {
  range: string
  available: boolean
  totalCostUsd: number
  totalTokens: number
  byModel: Array<{ model: string; costUsd: number }>
  estimated: EstimatedUsage | null
}

function unavailable(range: string, estimated: EstimatedUsage | null = null): UsageResponse {
  return { range, available: false, totalCostUsd: 0, totalTokens: 0, byModel: [], estimated }
}

// events 기반 실사용 추정 — 실패 시 null degrade(청구액 표시는 유지).
async function estimateProductionUsage(sinceIso: string): Promise<EstimatedUsage | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('events')
      .select('user_id, type')
      .in('type', ['bookmark_saved', 'search_performed'])
      .gte('created_at', sinceIso)
    if (error) return null

    const rows = (data ?? []) as Array<{ user_id: string; type: string }>
    const byUser = new Map<string, { saves: number; searches: number }>()
    for (const r of rows) {
      const u = byUser.get(r.user_id) ?? { saves: 0, searches: 0 }
      if (r.type === 'bookmark_saved') u.saves += 1
      else u.searches += 1
      byUser.set(r.user_id, u)
    }
    const costOf = (u: { saves: number; searches: number }) =>
      u.saves * COST_PER_SAVE_USD + u.searches * COST_PER_SEARCH_USD

    const ranked = [...byUser.values()].sort((a, b) => costOf(b) - costOf(a))
    const perUser: EstimatedUsage['perUser'] = []
    ranked.forEach((u, i) => {
      const cost = costOf(u)
      if (i < 2) perUser.push({ user: `U${i + 1}`, costUsd: cost })
      else if (perUser[2]) perUser[2].costUsd += cost
      else perUser.push({ user: '기타', costUsd: cost })
    })

    const saves = rows.filter((r) => r.type === 'bookmark_saved').length
    const searches = rows.length - saves
    return {
      productionCostUsd: saves * COST_PER_SAVE_USD + searches * COST_PER_SEARCH_USD,
      saves,
      searches,
      perUser,
    }
  } catch {
    return null
  }
}

// OpenAI Organization Costs API 응답 형태: { data: [{ results: [{ amount: { value } }] }] }
// value가 number 또는 numeric string(재무 API의 부동소수점 회피 관례)으로 올 수 있어 unknown으로 받고 Number()로 강제.
type CostsApiResponse = {
  data?: Array<{ results?: Array<{ amount?: { value?: unknown } }> }>
}

// next: revalidate와 동일 — URL을 15분 단위로 고정해 캐시가 실제로 히트하도록 버킷팅
const CACHE_WINDOW_SECONDS = 900

export const GET = withAdmin(async (req) => {
  const range = parseRange(new URL(req.url).searchParams.get('range'))
  // Date.now()를 그대로 쓰면 매 요청마다 URL(=캐시 키)이 달라져 캐시가 무력화된다.
  // 15분 단위로 버킷팅해 같은 윈도우 내 요청은 동일 URL → Next.js Data Cache 히트.
  const bucket = Math.floor(Date.now() / 1000 / CACHE_WINDOW_SECONDS) * CACHE_WINDOW_SECONDS
  const startTime = bucket - RANGE_DAYS[range] * 86400

  // 실사용 추정은 청구액 조회 가능 여부와 무관 — admin 키 없어도 계산.
  const estimated = await estimateProductionUsage(new Date(startTime * 1000).toISOString())

  // OPENAI_API_KEY(태깅/임베딩용)와 분리된 Organization Admin 전용 키.
  // Costs/Usage API는 organization-level 권한이 필요해 별도 스코프 키를 사용한다.
  const key = process.env.OPENAI_ADMIN_KEY
  if (!key) return NextResponse.json(unavailable(range, estimated))

  try {
    const res = await fetch(
      `https://api.openai.com/v1/organization/costs?start_time=${startTime}&limit=180`,
      {
        headers: { Authorization: `Bearer ${key}` },
        // 사용량 API는 지연·rate limit 있음 → 15분 캐시
        next: { revalidate: CACHE_WINDOW_SECONDS },
      }
    )
    if (!res.ok) return NextResponse.json(unavailable(range, estimated))

    const json = (await res.json()) as CostsApiResponse
    const totalCostUsd = (json.data ?? [])
      .flatMap((b) => b.results ?? [])
      .reduce((sum, r) => sum + (Number(r.amount?.value) || 0), 0)

    return NextResponse.json({
      range,
      available: true,
      totalCostUsd,
      totalTokens: 0, // 토큰 상세는 usage/completions 엔드포인트로 확장 (Phase 2, 범위 외)
      byModel: [],
      estimated,
    } satisfies UsageResponse)
  } catch {
    // 키 미설정 · 비200 응답 · 네트워크 예외 · 파싱 실패 모두 available:false로 무음 폴백
    return NextResponse.json(unavailable(range, estimated))
  }
})
