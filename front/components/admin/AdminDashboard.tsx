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

  useEffect(() => {
    let alive = true
    Promise.all([
      fetch(`/api/admin/stats?range=${range}`).then((r) => r.json()),
      fetch(`/api/admin/openai-usage?range=${range}`).then((r) => r.json()),
    ]).then(([s, u]) => {
      if (!alive) return
      setStats({ okr: s.okr, categories: s.categories })
      setUsage(u)
    })
    return () => {
      alive = false
    }
  }, [range])

  const setRange = (r: AdminRange) => router.push(`${pathname}?range=${r}`)
  const selectCategory = (name: string) =>
    router.push(`${pathname}?range=${range}&category=${encodeURIComponent(name)}`)

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Admin Dashboard</h1>
        <div className="flex gap-1 rounded-lg border p-1">
          {ADMIN_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded px-3 py-1 text-sm ${r === range ? 'bg-foreground text-background' : ''}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {stats ? <OkrTiles okr={stats.okr} /> : <p className="text-sm text-muted-foreground">불러오는 중…</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {usage && <OpenAiUsage usage={usage} activeUsers={stats?.okr.activeUsers ?? 0} />}
        {stats && <CategoryPie categories={stats.categories} onSelect={selectCategory} />}
      </div>

      <CategoryDrilldownModal range={range} />
    </main>
  )
}
