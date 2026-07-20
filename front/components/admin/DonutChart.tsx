'use client'

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

export type DonutDatum = { label: string; value: number; pct: number }

// 내부 도구용 정적 팔레트 (색은 의미가 아니라 구분용)
const COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4',
  '#a855f7', '#ec4899', '#84cc16', '#14b8a6', '#f97316',
]

export function DonutChart({
  data,
  onSliceClick,
}: {
  data: DonutDatum[]
  onSliceClick?: (label: string) => void
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">데이터 없음</p>
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {/* 차트 자체는 시각적 보조 요소 — 키보드/스크린리더 접근은 아래 범례(버튼)가 전담 */}
      <div aria-hidden="true" className="h-56 w-full sm:w-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="55%"
              outerRadius="85%"
              paddingAngle={2}
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
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              {onSliceClick ? (
                <button
                  type="button"
                  className="hover:underline"
                  onClick={() => onSliceClick(d.label)}
                >
                  {d.label}
                </button>
              ) : (
                <span>{d.label}</span>
              )}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {Math.round(d.pct * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
