function Metric({ label, ratio }: { label: string; ratio: number }) {
  const pct = Math.round((Number.isFinite(ratio) ? ratio : 0) * 100)
  return (
    <div>
      <div className="text-sm text-text-secondary">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">{pct}%</div>
    </div>
  )
}

export function HealthStats({
  deadRatio,
  uncategorizedRatio,
}: {
  deadRatio: number
  uncategorizedRatio: number
}) {
  return (
    <section className="h-full rounded-lg border border-line bg-surface-card p-4">
      <h2 className="mb-3 text-sm font-medium text-text-secondary">건강 지표</h2>
      <div className="grid grid-cols-2 gap-4">
        <Metric label="데드링크" ratio={deadRatio} />
        <Metric label="미분류" ratio={uncategorizedRatio} />
      </div>
    </section>
  )
}
