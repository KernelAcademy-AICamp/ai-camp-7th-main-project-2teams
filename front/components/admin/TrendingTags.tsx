export type TrendingTag = { tag: string; count: number; prevCount: number }

export function TrendingTags({ data }: { data: TrendingTag[] }) {
  return (
    <section className="rounded-lg border border-line bg-surface-card p-4">
      <h2 className="mb-3 text-sm font-medium text-text-secondary">트렌딩 태그</h2>
      {data.length === 0 ? (
        <p className="text-sm text-text-secondary">데이터 없음</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {data.map((d) => {
            const delta = d.count - d.prevCount
            const up = delta > 0
            const flat = delta === 0
            const deltaLabel = up ? `+${delta}` : String(delta)
            const color = up ? 'text-mint' : flat ? 'text-text-secondary' : 'text-destructive'
            return (
              <li key={d.tag} className="flex items-center justify-between gap-2 border-b border-line py-1 last:border-b-0">
                <span className="text-text-primary">{d.tag}</span>
                <span className="flex items-center gap-2 tabular-nums">
                  <span className="text-text-secondary">{d.count}건</span>
                  <span className={`text-xs ${color}`}>{deltaLabel}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
