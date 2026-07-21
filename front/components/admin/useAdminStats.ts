'use client'

import { useEffect, useState } from 'react'
import type { AdminRange } from '@/lib/admin-range'
import type { Okr } from './OkrTiles'
import type { CategoryStat } from './CategoryBar'
import type { GrowthPoint } from './GrowthChart'
import type { TrendingTag } from './TrendingTags'

export type AdminStats = {
  okr: Okr
  categories: CategoryStat[]
  growth: GrowthPoint[]
  trending: TrendingTag[]
  health: { deadRatio: number; uncategorizedRatio: number }
}

const LOAD_ERROR = '대시보드 데이터를 불러오지 못했습니다'

// 성장/운영 대시보드 공용 stats 로더 — range 변경 시 재요청
export function useAdminStats(range: AdminRange) {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/admin/stats?range=${range}`)
      .then(async (res) => {
        if (!alive) return
        if (!res.ok) {
          setError(LOAD_ERROR)
          return
        }
        const s = await res.json()
        if (!alive) return
        if (!s || !s.okr || !s.categories) {
          setError(LOAD_ERROR)
          return
        }
        setError(null)
        setStats({
          okr: s.okr,
          categories: s.categories,
          growth: s.growth ?? [],
          trending: s.trending ?? [],
          health: s.health ?? { deadRatio: 0, uncategorizedRatio: 0 },
        })
      })
      .catch(() => {
        if (alive) setError(LOAD_ERROR)
      })
    return () => {
      alive = false
    }
  }, [range])

  return { stats, error }
}
