'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { ADMIN_RANGES, parseRange, type AdminRange } from '@/lib/admin-range'
import { OkrTiles, type Okr } from './OkrTiles'
import { OpenAiUsage, type Usage } from './OpenAiUsage'
import { CategoryPie, type CategoryStat } from './CategoryPie'
import { CategoryDrilldownModal } from './CategoryDrilldownModal'

type Stats = { okr: Okr; categories: CategoryStat[] }

export function AdminDashboard() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const range = parseRange(params.get('range'))

  const [stats, setStats] = useState<Stats | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([fetch(`/api/admin/stats?range=${range}`), fetch(`/api/admin/openai-usage?range=${range}`)])
      .then(async ([statsRes, usageRes]) => {
        if (!alive) return
        if (!statsRes.ok) {
          setError('대시보드 데이터를 불러오지 못했습니다')
          return
        }
        const s = await statsRes.json()
        if (!alive) return
        if (!s || !s.okr || !s.categories) {
          setError('대시보드 데이터를 불러오지 못했습니다')
          return
        }
        const u = usageRes.ok
          ? await usageRes.json()
          : { available: false, totalCostUsd: 0, totalTokens: 0, byModel: [] }
        if (!alive) return
        setError(null)
        setStats({ okr: s.okr, categories: s.categories })
        setUsage(u)
      })
      .catch(() => {
        if (alive) setError('대시보드 데이터를 불러오지 못했습니다')
      })
    return () => {
      alive = false
    }
  }, [range])

  // URLSearchParams 기반으로 기존 파라미터(category 등)를 보존하며 갱신
  const setRange = (r: AdminRange) => {
    const next = new URLSearchParams(params)
    next.set('range', r)
    router.push(`${pathname}?${next.toString()}`)
  }
  const selectCategory = (name: string) => {
    const next = new URLSearchParams(params)
    next.set('category', name)
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
      <div className="flex items-end justify-between border-b pb-5" style={{ borderColor: 'var(--sr-line)' }}>
        <div>
          <div className="sr-eyebrow">Growth · Ops · Internal</div>
          <h1 className="sr-wordmark mt-1 text-3xl">Signal Room</h1>
        </div>
        <div className="sr-segment">
          {ADMIN_RANGES.map((r) => (
            <button key={r} type="button" aria-pressed={r === range} onClick={() => setRange(r)}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="sr-error">{error}</p>
      ) : stats ? (
        <OkrTiles okr={stats.okr} />
      ) : (
        <p className="sr-muted">불러오는 중…</p>
      )}

      {!error && (
        <div className="grid gap-5 sm:grid-cols-5">
          <div className="sm:col-span-2">
            {usage && <OpenAiUsage usage={usage} activeUsers={stats?.okr.activeUsers ?? 0} />}
          </div>
          <div className="sm:col-span-3">
            {stats && <CategoryPie categories={stats.categories} onSelect={selectCategory} />}
          </div>
        </div>
      )}

      {!error && <CategoryDrilldownModal range={range} />}
    </main>
  )
}
