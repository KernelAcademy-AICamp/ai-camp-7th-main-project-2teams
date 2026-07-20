export type BarDatum = { label: string; value: number; pct: number }

// Mowaba 브랜드 축 단색 — 색은 의미 아니라 순위 시각화용
export function BarList({
  data,
  onSelect,
}: {
  data: BarDatum[]
  onSelect?: (label: string) => void
}) {
  if (data.length === 0) {
    return <p className="text-sm text-text-secondary">데이터 없음</p>
  }
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <ul className="space-y-2">
      {data.map((d) => {
        const roundedPct = Math.round(d.pct * 100)
        const widthPct = Math.max((d.value / max) * 100, 2)
        return (
          <li key={d.label} className="text-sm">
            <div className="mb-1 flex items-center justify-between gap-2">
              {onSelect ? (
                <button
                  type="button"
                  className="text-left text-text-primary hover:text-brand hover:underline"
                  onClick={() => onSelect(d.label)}
                >
                  {d.label}
                </button>
              ) : (
                <span className="text-text-primary">{d.label}</span>
              )}
              <span className="tabular-nums text-text-secondary">
                {d.value}건 ({roundedPct}%)
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-brand" style={{ width: `${widthPct}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
