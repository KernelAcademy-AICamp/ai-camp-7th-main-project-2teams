import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/admin-auth'
import { parseRange, RANGE_DAYS } from '@/lib/admin-range'

type UsageResponse = {
  range: string
  available: boolean
  totalCostUsd: number
  totalTokens: number
  byModel: Array<{ model: string; costUsd: number }>
}

function unavailable(range: string): UsageResponse {
  return { range, available: false, totalCostUsd: 0, totalTokens: 0, byModel: [] }
}

// OpenAI Organization Costs API 응답 형태: { data: [{ results: [{ amount: { value } }] }] }
type CostsApiResponse = {
  data?: Array<{ results?: Array<{ amount?: { value?: number } }> }>
}

// next: revalidate와 동일 — URL을 15분 단위로 고정해 캐시가 실제로 히트하도록 버킷팅
const CACHE_WINDOW_SECONDS = 900

export const GET = withAdmin(async (req) => {
  const range = parseRange(new URL(req.url).searchParams.get('range'))
  // OPENAI_API_KEY(태깅/임베딩용)와 분리된 Organization Admin 전용 키.
  // Costs/Usage API는 organization-level 권한이 필요해 별도 스코프 키를 사용한다.
  const key = process.env.OPENAI_ADMIN_KEY
  if (!key) return NextResponse.json(unavailable(range))

  // Date.now()를 그대로 쓰면 매 요청마다 URL(=캐시 키)이 달라져 캐시가 무력화된다.
  // 15분 단위로 버킷팅해 같은 윈도우 내 요청은 동일 URL → Next.js Data Cache 히트.
  const bucket = Math.floor(Date.now() / 1000 / CACHE_WINDOW_SECONDS) * CACHE_WINDOW_SECONDS
  const startTime = bucket - RANGE_DAYS[range] * 86400

  try {
    const res = await fetch(
      `https://api.openai.com/v1/organization/costs?start_time=${startTime}&limit=180`,
      {
        headers: { Authorization: `Bearer ${key}` },
        // 사용량 API는 지연·rate limit 있음 → 15분 캐시
        next: { revalidate: CACHE_WINDOW_SECONDS },
      }
    )
    if (!res.ok) return NextResponse.json(unavailable(range))

    const json = (await res.json()) as CostsApiResponse
    const totalCostUsd = (json.data ?? [])
      .flatMap((b) => b.results ?? [])
      .reduce((sum, r) => sum + (r.amount?.value ?? 0), 0)

    return NextResponse.json({
      range,
      available: true,
      totalCostUsd,
      totalTokens: 0, // 토큰 상세는 usage/completions 엔드포인트로 확장 (Phase 2, 범위 외)
      byModel: [],
    } satisfies UsageResponse)
  } catch {
    // 키 미설정 · 비200 응답 · 네트워크 예외 · 파싱 실패 모두 available:false로 무음 폴백
    return NextResponse.json(unavailable(range))
  }
})
