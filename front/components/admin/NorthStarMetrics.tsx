'use client'

import { useEffect, useState } from 'react'
import { AreaChart, Area, Tooltip, XAxis, YAxis, ResponsiveContainer } from 'recharts'

export type WeeklyMetric = {
  week: string
  newSaves: number
  autoCoverage: number
  searchSuccess: number
  activeCurators: number
  retrieved: number
  manualRetags: number
}

// 유저별 주간 되찾기 도트 — user는 익명 키(U1·U2·기타), 서버가 user_id를 노출하지 않음
export type PerUserDot = { week: string; user: string; count: number }

// 도트 시리즈 고정 색 — validate_palette.js 통과(CVD ΔE 24.1 · normal 29.4).
// '기타'는 중립 회색(범주 아님, 잔여 합산). 색은 순서가 아니라 키에 고정.
const DOT_COLORS: Record<string, string> = { U1: '#4a90e2', U2: '#e8833a', 기타: '#9aa0a8' }

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
  const [perUser, setPerUser] = useState<PerUserDot[]>([])
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
        setPerUser(Array.isArray(body.perUser) ? body.perUser : [])
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

          {/* 유저별 주간 되찾기 도트 — NSM을 유저 단위로 분해 (PM 1순위 지표).
              8주 축은 metrics와 공유, (유저,주) 조합 없으면 0점 표시 — "되찾기 없음"도 정보. */}
          {perUser.length > 0 && (
            <PerUserDotPlot weeks={metrics.map((m) => m.week)} dots={perUser} />
          )}
        </>
      )}
    </section>
  )
}

// 유저별 주간 되찾기 스트립 도트. 색은 익명 키에 고정(DOT_COLORS), 흰 테두리 2px로 겹침 구분.
function PerUserDotPlot({ weeks, dots }: { weeks: string[]; dots: PerUserDot[] }) {
  const users = [...new Set(dots.map((d) => d.user))]
  // 주 버킷 문자열 포맷 차이(RPC 'T00:00:00Z' vs JS toISOString '.000Z') 흡수 — 라벨(월/일)로 매칭
  const byLabel = new Map(dots.map((d) => [`${d.user}|${fmtWeek(d.week)}`, d.count]))
  const series = users.map((user) => ({
    user,
    data: weeks.map((w) => ({
      label: fmtWeek(w),
      count: byLabel.get(`${user}|${fmtWeek(w)}`) ?? 0,
    })),
  }))

  // 유저 수가 적고 대부분 0건이라 한 차트에 겹치면 0선에 점이 쌓여 해석 불가 —
  // 유저당 미니 차트 1행(스몰 멀티플)로 분리. y축 최대는 전 유저 공유(비교 가능성 유지).
  const yMax = Math.max(...dots.map((d) => d.count), 4)

  return (
    <div className="mt-4">
      <h3 className="mb-2 text-xs font-medium text-text-secondary">
        유저별 주간 되찾기 (익명 · U1=최다 사용자 · 동일 스케일)
      </h3>
      <div className="space-y-2">
        {series.map((s) => {
          const color = DOT_COLORS[s.user] ?? '#9aa0a8'
          const total = s.data.reduce((sum, d) => sum + d.count, 0)
          return (
            <div key={s.user} className="flex items-center gap-2">
              <div className="w-14 shrink-0 text-right">
                <span
                  aria-hidden
                  className="mr-1 inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs font-medium text-text-primary">{s.user}</span>
                <div className="text-[10px] tabular-nums text-text-secondary">{total}건</div>
              </div>
              <div className="h-16 min-w-0 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={s.data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis domain={[0, yMax]} hide />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      formatter={(value) => [`${value}건`, '되찾기']}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke={color}
                      strokeWidth={2}
                      fill={color}
                      fillOpacity={0.12}
                      dot={{ r: 3.5, fill: color, stroke: '#ffffff', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )
        })}
      </div>
      <p className="sr-only">
        {series
          .map((s) => `${s.user}: ${s.data.map((d) => `${d.label} ${d.count}건`).join(', ')}`)
          .join('; ')}
      </p>
    </div>
  )
}
