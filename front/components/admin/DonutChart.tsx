'use client'

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

export type DonutDatum = { label: string; value: number; pct: number }

// SIGNAL ROOM 팔레트 — 관제실 다크 테마와 어울리는 신호색 계열 (색은 의미가 아니라 구분용)
const COLORS = [
  '#baff29', '#4fd6c4', '#b39bff', '#ffb020', '#ff7a7a',
  '#6fd6ff', '#e0a8ff', '#8fd960', '#ffd166', '#7c9490',
]

export function DonutChart({
  data,
  onSliceClick,
}: {
  data: DonutDatum[]
  onSliceClick?: (label: string) => void
}) {
  if (data.length === 0) {
    return <p className="sr-empty">데이터 없음</p>
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
              stroke="var(--sr-bg)"
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
      <ul className="flex-1">
        {data.map((d, i) => (
          <li key={d.label} className="sr-legend-row">
            <span className="sr-legend-label">
              <span className="sr-legend-dot" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              {onSliceClick ? (
                <button type="button" className="sr-legend-btn" onClick={() => onSliceClick(d.label)}>
                  {d.label}
                </button>
              ) : (
                <span>{d.label}</span>
              )}
            </span>
            <span className="sr-legend-pct">{Math.round(d.pct * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
