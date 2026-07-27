import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import {
  COST_EVENT_TYPES,
  LABEL_WINDOW_DAYS,
  labelOf,
  labelOrder,
  labelUsersByCost,
} from '@/lib/admin-user-labels'

// North Star 주간 지표(집계 함수 admin_metrics_weekly, 0031). service_role 전용 RPC라 admin 클라이언트로 호출.
// range(1d/7d/30d)와 무관 — NSM은 주간 고정. 최근 8주.
const WEEKS = 8

type MetricRow = {
  week: string
  new_saves: number | string
  auto_coverage: number | string
  search_success: number | string
  active_curators: number | string
  retrieved: number | string
  manual_retags: number | string
}

// date_trunc('week')와 동일한 월요일 시작 UTC 주 버킷 — RPC 주차와 라벨이 맞도록.
function weekStartIso(d: Date): string {
  const day = (d.getUTCDay() + 6) % 7 // 월=0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString()
}

// 유저별 주간 되찾기 도트용 — NSM(retrieved)을 유저 단위로 분해. RPC 확장(마이그레이션) 대신
// events 직접 집계(볼륨 소량). user_id는 응답에 절대 미포함 — 익명 라벨은 admin-user-labels의
// 공용 매핑(비용 랭킹)을 그대로 쓴다. 여기서 클릭 수로 다시 랭킹하면 다른 위젯의 U1과 다른
// 사람을 가리키게 된다(#305).
type PerUserDot = { week: string; user: string; count: number }
function aggregatePerUser(
  rows: Array<{ user_id: string; created_at: string }>,
  labels: ReadonlyMap<string, string>,
): PerUserDot[] {
  const dots = new Map<string, number>() // `${label}|${week}` → count ('기타' 합산 대비)
  for (const r of rows) {
    const k = `${labelOf(labels, r.user_id)}|${weekStartIso(new Date(r.created_at))}`
    dots.set(k, (dots.get(k) ?? 0) + 1)
  }
  return [...dots.entries()]
    .map(([k, count]) => {
      const [user, week] = k.split('|')
      return { week, user, count }
    })
    .sort((a, b) => a.week.localeCompare(b.week) || labelOrder(a.user) - labelOrder(b.user))
}

export const GET = withAdmin(async () => {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('admin_metrics_weekly', { p_weeks: WEEKS })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const metrics = ((data ?? []) as MetricRow[]).map((r) => ({
    week: r.week,
    newSaves: Number(r.new_saves),
    autoCoverage: Number(r.auto_coverage),
    searchSuccess: Number(r.search_success),
    activeCurators: Number(r.active_curators),
    retrieved: Number(r.retrieved),
    manualRetags: Number(r.manual_retags),
  }))

  // 도트 분해는 보조 지표 — 실패해도 핵심 metrics 응답은 유지(빈 배열 degrade).
  // 클릭(도트 값)과 저장·검색(익명 라벨 랭킹)을 한 쿼리로 가져온다.
  // 두 용도의 창이 다를 수 있으므로 더 넓은 쪽에 맞춘다 — WEEKS만 늘리면 뒷주 도트가 조용히 비고,
  // 반대로 좁히면 라벨 랭킹이 다른 위젯과 어긋난다. 축 밖 클릭은 컴포넌트가 버린다.
  const windowDays = Math.max(WEEKS * 7, LABEL_WINDOW_DAYS)
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString()
  const { data: events, error: eventError } = await admin
    .from('events')
    .select('user_id, type, created_at')
    .in('type', [...COST_EVENT_TYPES, 'search_result_clicked'])
    .gte('created_at', since)
  // degrade는 하되 무음은 금지 — 로그가 없으면 "클릭 0건"과 "쿼리 실패"를 구분할 수 없다
  if (eventError) logger.warn('[admin/metrics] perUser 집계 실패', { error: eventError.message })
  const rows = (events ?? []) as Array<{ user_id: string; type: string; created_at: string }>
  const perUser = eventError
    ? []
    : aggregatePerUser(
        rows.filter((r) => r.type === 'search_result_clicked'),
        labelUsersByCost(rows.filter((r) => r.type !== 'search_result_clicked')),
      )

  return NextResponse.json({ metrics, perUser })
})
