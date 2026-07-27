import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseRange, RANGE_DAYS } from '@/lib/admin-range'
import { logger } from '@/lib/logger'
import {
  COST_EVENT_TYPES,
  COST_PER_SAVE_USD,
  COST_PER_SEARCH_USD,
  LABEL_WINDOW_DAYS,
  labelOf,
  labelOrder,
  labelUsersByCost,
} from '@/lib/admin-user-labels'

// 실사용 추정(청구액에서 개발·eval 비용 분리) — Costs API는 단일 프로젝트라 호출 주체 구분 불가.
// events 건수 × 단가로 프로덕션 사용분을 추정한다. 단가 근거(단가·라벨 규약은 admin-user-labels.ts 단일 출처):
//   저장 1건 = gpt-4o-mini 태깅(~2.7k in/$0.15 · ~0.2k out/$0.60 per 1M) + 3-large 임베딩(~1k/$0.13 per 1M) ≈ $0.00065
//   검색 1건 = 확장 쿼리 임베딩 2~3회 소량 토큰 ≈ $0.00002
// ponytail: 상수 추정 — 정밀 분리가 필요해지면 OpenAI 프로젝트 분리(prod/dev 키)로 승격.

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
// 라벨 창(56일)까지 한 번에 조회하고 range 구간은 코드에서 잘라 쓴다 — 라벨은 range와 무관해야
// 다른 위젯의 U1과 같은 사람을 가리킨다(#305). range는 최대 30일이라 항상 라벨 창 안쪽.
async function estimateProductionUsage(
  rangeSinceIso: string,
  labelSinceIso: string,
): Promise<EstimatedUsage | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('events')
      .select('user_id, type, created_at')
      .in('type', [...COST_EVENT_TYPES])
      .gte('created_at', labelSinceIso)
    // 로깅 없이 null을 반환하면 "이벤트 0건"과 "쿼리 실패"가 UI·로그 어디서도 구분 불가
    if (error) {
      logger.warn('[openai-usage] events 조회 실패 — 실사용 추정 degrade', {
        error: error.message,
      })
      return null
    }

    const windowRows = (data ?? []) as Array<{ user_id: string; type: string; created_at: string }>
    // 라벨은 창 전체(56일) 기준 — 비용 표시는 선택된 range 기준
    const labels = labelUsersByCost(windowRows)
    const rows = windowRows.filter((r) => r.created_at >= rangeSinceIso)

    const costByLabel = new Map<string, number>()
    for (const r of rows) {
      const label = labelOf(labels, r.user_id)
      const cost = r.type === 'bookmark_saved' ? COST_PER_SAVE_USD : COST_PER_SEARCH_USD
      costByLabel.set(label, (costByLabel.get(label) ?? 0) + cost)
    }
    const perUser: EstimatedUsage['perUser'] = [...costByLabel.entries()]
      .map(([user, costUsd]) => ({ user, costUsd }))
      .sort((a, b) => labelOrder(a.user) - labelOrder(b.user))

    const saves = rows.filter((r) => r.type === 'bookmark_saved').length
    const searches = rows.length - saves
    return {
      productionCostUsd: saves * COST_PER_SAVE_USD + searches * COST_PER_SEARCH_USD,
      saves,
      searches,
      perUser,
    }
  } catch (err) {
    logger.error('[openai-usage] 실사용 추정 실패', {
      error: err instanceof Error ? err.message : String(err),
    })
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
  const estimated = await estimateProductionUsage(
    new Date(startTime * 1000).toISOString(),
    new Date((bucket - LABEL_WINDOW_DAYS * 86400) * 1000).toISOString(),
  )

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
