'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { parseRange } from '@/lib/admin-range'
import { useAdminStats } from './useAdminStats'
import { DashboardLoading } from './DashboardLoading'
import { HealthStats } from './HealthStats'
import { OpenAiUsage, type Usage } from './OpenAiUsage'
import { AdminManager } from './AdminManager'

const EMPTY_USAGE: Usage = { available: false, totalCostUsd: 0, totalTokens: 0, byModel: [] }

// 운영·개발 지표 — 데이터 건전성, OpenAI 사용량, 관리자 관리
export function OpsDashboard() {
  const params = useSearchParams()
  const range = parseRange(params.get('range'))
  const { stats, error } = useAdminStats(range)
  const [usage, setUsage] = useState<Usage | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/admin/openai-usage?range=${range}`)
      .then(async (res) => {
        const u = res.ok ? await res.json() : EMPTY_USAGE
        if (alive) setUsage(u)
      })
      .catch(() => {
        if (alive) setUsage(EMPTY_USAGE)
      })
    return () => {
      alive = false
    }
  }, [range])

  return (
    <div className="space-y-6">
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !stats ? (
        <DashboardLoading />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <HealthStats deadRatio={stats.health.deadRatio} uncategorizedRatio={stats.health.uncategorizedRatio} />
            {usage && <OpenAiUsage usage={usage} activeUsers={stats.okr.activeUsers} />}
          </div>

          <AdminManager />
        </>
      )}
    </div>
  )
}
