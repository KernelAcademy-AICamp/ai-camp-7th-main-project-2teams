'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { parseRange } from '@/lib/admin-range'
import { useAdminStats } from './useAdminStats'
import { DashboardLoading } from './DashboardLoading'
import { OkrTiles } from './OkrTiles'
import { CategoryBar } from './CategoryBar'
import { GrowthChart } from './GrowthChart'
import { TrendingTags } from './TrendingTags'
import { CategoryDrilldownModal } from './CategoryDrilldownModal'

// 마케팅·그로스 지표 — OKR, 성장 추이, 카테고리 분포, 트렌딩 태그
export function GrowthDashboard() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const range = parseRange(params.get('range'))
  const { stats, error } = useAdminStats(range)

  const selectCategory = (name: string) => {
    const next = new URLSearchParams(params)
    next.set('category', name)
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : stats ? (
        <OkrTiles okr={stats.okr} />
      ) : (
        <DashboardLoading />
      )}

      {!error && stats && (
        <>
          <GrowthChart data={stats.growth} />

          <div className="grid gap-4 sm:grid-cols-2">
            <CategoryBar categories={stats.categories} onSelect={selectCategory} />
            <TrendingTags data={stats.trending} />
          </div>
        </>
      )}

      {!error && <CategoryDrilldownModal range={range} />}
    </div>
  )
}
