'use client'

import { BarList, type BarDatum } from './BarList'

export type CategoryStat = { name: string; count: number; pct: number }

export function CategoryBar({
  categories,
  onSelect,
}: {
  categories: CategoryStat[]
  onSelect: (name: string) => void
}) {
  const data: BarDatum[] = categories.map((c) => ({ label: c.name, value: c.count, pct: c.pct }))
  return (
    <section className="rounded-lg border border-line bg-surface-card p-4">
      <h2 className="mb-3 text-sm font-medium text-text-secondary">카테고리 분포</h2>
      <BarList data={data} onSelect={onSelect} />
    </section>
  )
}
