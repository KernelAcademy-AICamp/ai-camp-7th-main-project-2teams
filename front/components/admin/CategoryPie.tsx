'use client'

import { DonutChart, type DonutDatum } from './DonutChart'

export type CategoryStat = { name: string; count: number; pct: number }

export function CategoryPie({
  categories,
  onSelect,
}: {
  categories: CategoryStat[]
  onSelect: (name: string) => void
}) {
  const data: DonutDatum[] = categories.map((c) => ({
    label: c.name,
    value: c.count,
    pct: c.pct,
  }))
  return (
    <section className="h-full rounded-lg border border-line bg-surface-card p-4">
      <h2 className="mb-3 text-sm font-medium text-text-secondary">카테고리 분포</h2>
      <DonutChart data={data} onSliceClick={onSelect} />
    </section>
  )
}
