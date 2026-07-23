'use client'

import { useEffect, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from 'recharts'

export type WeeklyMetric = {
  week: string
  newSaves: number
  autoCoverage: number
  searchSuccess: number
  activeCurators: number
  retrieved: number
  manualRetags: number
}

const LOAD_ERROR = 'North Star 지표를 불러오지 못했습니다'

// bucket ISO → 월/일 라벨 (GrowthChart와 동일 규약)
function fmtWeek(week: string): string {
  const d = new Date(week)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

type Tile = { label: string; value: string; hint?: string }

// 최신 주 5지표 요약 타일. retrieved(★ NSM) 강조.
function tilesFrom(m: WeeklyMetric): Tile[] {
  return [
    { label: '★ 주간 되찾은 북마크', value: String(m.retrieved), hint: 'North Star' },
    { label: '신규 저장', value: String(m.newSaves) },
    { label: '자동분류 커버리지', value: pct(m.autoCoverage) },
    { label: '검색 성공률', value: pct(m.searchSuccess) },
    { label: '활성 큐레이터', value: String(m.activeCurators) },
    { label: '수동 재태깅', value: String(m.manualRetags), hint: '자동 교정' },
  ]
}

// North Star 주간 지표 위젯 — /api/admin/metrics(admin_metrics_weekly) 소비. 주간 고정(range 무관).
export function NorthStarMetrics() {
  const [metrics, setMetrics] = useState<WeeklyMetric[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/admin/metrics')
      .then(async (res) => {
        if (!alive) return
        if (!res.ok) {
          setError(LOAD_ERROR)
          return
        }
        const body = await res.json()
        if (!alive) return
        if (!body || !Array.isArray(body.metrics)) {
          setError(LOAD_ERROR)
          return
        }
        setError(null)
        setMetrics(body.metrics)
      })
      .catch(() => {
        if (alive) setError(LOAD_ERROR)
      })
    return () => {
      alive = false
    }
  }, [])

  const latest = metrics && metrics.length > 0 ? metrics[metrics.length - 1] : null

  return (
    <section className="rounded-lg border border-line bg-surface-card p-4">
      <h2 className="mb-3 text-sm font-medium text-text-secondary">North Star · 주간 지표 (최근 8주)</h2>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !metrics ? (
        <p className="text-sm text-text-secondary">불러오는 중…</p>
      ) : !latest ? (
        <p className="text-sm text-text-secondary">데이터 없음</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {tilesFrom(latest).map((t) => (
              <div key={t.label} className="rounded-md border border-line p-3">
                <div className="text-xs text-text-secondary">{t.label}</div>
                <div className="mt-1 text-xl font-semibold text-text-primary">{t.value}</div>
                {t.hint && <div className="mt-0.5 text-[10px] font-medium text-brand">{t.hint}</div>}
              </div>
            ))}
          </div>

          {/* NSM(되찾은 북마크) 주간 추이 */}
          <div className="mt-4 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics.map((m) => ({ ...m, label: fmtWeek(m.week) }))}>
                <defs>
                  <linearGradient id="gRetrieved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4a90e2" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#4a90e2" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                <Area type="monotone" dataKey="retrieved" stroke="#4a90e2" fill="url(#gRetrieved)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {/* 접근성: recharts SVG는 스크린리더 비친화 → 텍스트 요약 병기 */}
          <p className="sr-only">
            {metrics.map((m) => `${fmtWeek(m.week)} 되찾은 북마크 ${m.retrieved}`).join('; ')}
          </p>
        </>
      )}
    </section>
  )
}
