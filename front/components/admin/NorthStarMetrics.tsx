'use client'

import { useEffect, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from 'recharts'
import { dotColor } from '@/lib/admin-user-labels'

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

// 유저별 주간 되찾기 스트립 도트. 색은 익명 키에 고정(dotColor), 흰 테두리 2px로 겹침 구분.
export function PerUserDotPlot({ weeks, dots }: { weeks: string[]; dots: PerUserDot[] }) {
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

  // 상단 NSM area 차트가 이미 "추이"를 담당 — 유저별 뷰가 시간축을 또 그리면 축소 복제가 된다.
  // 여기선 질문을 바꾼다: "이번 주 누가 되찾았고, 지난 주 대비 늘었나" — 덤벨 도트
  // (행=유저, x=건수, 회색 점=지난 주 → 컬러 점=이번 주). 시점 2개만 남기고 시간축 제거.
  const [prevWeek, currWeek] = weeks.slice(-2)
  const countOf = (user: string, week: string | undefined) =>
    week === undefined ? 0 : (byLabel.get(`${user}|${fmtWeek(week)}`) ?? 0)
  const rows = series.map((s) => ({
    user: s.user,
    prev: countOf(s.user, prevWeek),
    curr: countOf(s.user, currWeek),
    total: s.data.reduce((sum, d) => sum + d.count, 0),
  }))
  const xMax = Math.max(...rows.flatMap((r) => [r.prev, r.curr]), 4)
  const pct = (v: number) => (v / xMax) * 100

  return (
    <div className="mt-4">
      <h3 className="mb-1 text-xs font-medium text-text-secondary">
        유저별 되찾기 — 지난 주 → 이번 주 (익명 · U1=사용량 1위, 전 위젯 공통 라벨)
      </h3>
      <div className="mb-2 flex items-center gap-3 text-[10px] text-text-secondary">
        <span className="flex items-center gap-1">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full border border-[#94a3b8] bg-transparent" />
          지난 주{prevWeek ? ` (${fmtWeek(prevWeek)}~)` : ''}
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-text-primary" />
          이번 주{currWeek ? ` (${fmtWeek(currWeek)}~)` : ''}
        </span>
      </div>
      <div className="space-y-3">
        {rows.map((r) => {
          const color = dotColor(r.user)
          const lo = Math.min(r.prev, r.curr)
          const hi = Math.max(r.prev, r.curr)
          const delta = r.curr - r.prev
          return (
            <div key={r.user} className="flex items-center gap-2">
              <div className="w-16 shrink-0 text-right">
                <span className="text-xs font-medium text-text-primary">{r.user}</span>
                <div className="text-[10px] tabular-nums text-text-secondary">8주 {r.total}건</div>
              </div>
              {/* 트랙: 0..xMax 스케일 공유. 점 겹침(prev==curr)은 이번 주 점이 위에 오도록 순서 고정 */}
              <div className="relative h-6 min-w-0 flex-1">
                <div aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-line" />
                <div
                  aria-hidden
                  className="absolute top-1/2 h-0.5 -translate-y-1/2"
                  style={{ left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%`, backgroundColor: color, opacity: 0.35 }}
                />
                <span
                  aria-hidden
                  className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface-card"
                  style={{ left: `${pct(r.prev)}%`, borderColor: '#94a3b8' }}
                />
                <span
                  aria-hidden
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
                  style={{ left: `${pct(r.curr)}%`, backgroundColor: color }}
                />
              </div>
              <div className="w-20 shrink-0 text-xs tabular-nums text-text-primary">
                {r.curr}건
                <span className={`ml-1 text-[10px] ${delta > 0 ? 'text-mint' : delta < 0 ? 'text-warning' : 'text-text-secondary'}`}>
                  {delta > 0 ? `▲${delta}` : delta < 0 ? `▼${-delta}` : '—'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <div aria-hidden className="mt-1 flex justify-between pl-[4.5rem] pr-20 text-[10px] tabular-nums text-text-secondary">
        <span>0</span>
        <span>{xMax}</span>
      </div>
      {/* 표 뷰 — 정확한 숫자가 필요할 때 + 접근성(차트 SVG 대체 데이터). sr-only 대신 실제 표로 공개 */}
      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] text-text-secondary hover:text-text-primary">
          표로 보기
        </summary>
        <table className="mt-2 w-full text-xs tabular-nums">
          <caption className="sr-only">유저별 되찾기 — 지난 주·이번 주·증감·8주 합계</caption>
          <thead>
            <tr className="border-b border-line text-left text-[11px] text-text-secondary">
              <th scope="col" className="py-1 font-medium">유저</th>
              <th scope="col" className="py-1 text-right font-medium">지난 주</th>
              <th scope="col" className="py-1 text-right font-medium">이번 주</th>
              <th scope="col" className="py-1 text-right font-medium">증감</th>
              <th scope="col" className="py-1 text-right font-medium">8주 합계</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const delta = r.curr - r.prev
              return (
                <tr key={r.user} className="border-b border-line/50 text-text-primary">
                  <th scope="row" className="py-1 text-left font-medium">
                    <span
                      aria-hidden
                      className="mr-1.5 inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: dotColor(r.user) }}
                    />
                    {r.user}
                  </th>
                  <td className="py-1 text-right">{r.prev}</td>
                  <td className="py-1 text-right">{r.curr}</td>
                  <td className={`py-1 text-right ${delta > 0 ? 'text-mint' : delta < 0 ? 'text-warning' : 'text-text-secondary'}`}>
                    {delta > 0 ? `+${delta}` : delta}
                  </td>
                  <td className="py-1 text-right">{r.total}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </details>
    </div>
  )
}
