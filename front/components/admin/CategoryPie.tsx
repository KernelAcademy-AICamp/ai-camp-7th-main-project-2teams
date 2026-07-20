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
    <section className="sr-panel h-full">
      <h2 className="sr-panel-title">카테고리 분포</h2>
      <DonutChart data={data} onSliceClick={onSelect} />
    </section>
  )
}
