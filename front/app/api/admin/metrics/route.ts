import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'

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
  }))
  return NextResponse.json({ metrics })
})
