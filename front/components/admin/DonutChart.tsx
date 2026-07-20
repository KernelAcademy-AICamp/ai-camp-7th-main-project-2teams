'use client'

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

export type DonutDatum = { label: string; value: number; pct: number }

// Mowaba 팔레트 기반 — brand/mint 축에 차분한 보조색 추가 (색은 의미가 아니라 구분용)
const COLORS = [
  '#4a90e2', '#48c9b0', '#f1c40f', '#94a3b8', '#a78bfa',
  '#fb923c', '#38bdf8', '#f472b6', '#84cc16', '#64748b',
]

export function DonutChart({
  data,
  onSliceClick,
}: {
  data: DonutDatum[]
  onSliceClick?: (label: string) => void
}) {
  if (data.length === 0) {
    return <p className="text-sm text-text-secondary">데이터 없음</p>
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {/* 차트 자체는 시각적 보조 요소 — 키보드/스크린리더 접근은 아래 범례(버튼)가 전담 */}
      <div aria-hidden="true" className="h-48 w-full sm:w-48 sm:flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="58%"
              outerRadius="88%"
              paddingAngle={3}
              stroke="var(--color-surface-card)"
              strokeWidth={2}
              onClick={(d: unknown) => {
                const label = (d as { label?: string })?.label
                if (label && onSliceClick) onSliceClick(label)
              }}
            >
              {data.map((d, i) => (
                <Cell
                  key={d.label}
                  fill={COLORS[i % COLORS.length]}
                  cursor={onSliceClick ? 'pointer' : 'default'}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 space-y-1 text-sm">
        {data.map((d, i) => {
          // 반올림한 %만 보이면 소수 비율에서 "내용 있는데 0%"로 오해할 수 있어
          // 모든 행에 건수를 1차 표시로 통일하고, 비율은 괄호 안 보조 정보로 유지.
          const roundedPct = Math.round(d.pct * 100)
          return (
            <li key={d.label} className="flex items-center justify-between gap-2 border-b border-line py-1 last:border-b-0">
              <span className="flex items-center gap-2 text-text-primary">
                <span
                  className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                {onSliceClick ? (
                  <button
                    type="button"
                    className="text-left hover:text-brand hover:underline"
                    onClick={() => onSliceClick(d.label)}
                  >
                    {d.label}
                  </button>
                ) : (
                  <span>{d.label}</span>
                )}
              </span>
              <span className="tabular-nums text-text-secondary">
                {d.value}건 (<span className="tabular-nums">{roundedPct}%</span>)
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
