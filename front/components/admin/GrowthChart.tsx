'use client'

import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Legend } from 'recharts'

export type GrowthPoint = { bucket: string; signups: number; saves: number }

// bucket ISO → 짧은 라벨(월/일)
function fmt(bucket: string): string {
  const d = new Date(bucket)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function GrowthChart({ data }: { data: GrowthPoint[] }) {
  return (
    <section className="rounded-lg border border-line bg-surface-card p-4">
      <h2 className="mb-3 text-sm font-medium text-text-secondary">성장 추이</h2>
      {data.length === 0 ? (
        <p className="text-sm text-text-secondary">데이터 없음</p>
      ) : (
        <>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.map((d) => ({ ...d, label: fmt(d.bucket) }))}>
                <defs>
                  <linearGradient id="gSignups" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4a90e2" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#4a90e2" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gSaves" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#48c9b0" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#48c9b0" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                <Legend formatter={(v) => (v === 'signups' ? '신규 가입' : '저장')} wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="signups" stroke="#4a90e2" fill="url(#gSignups)" strokeWidth={2} />
                <Area type="monotone" dataKey="saves" stroke="#48c9b0" fill="url(#gSaves)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {/* 접근성: recharts SVG는 스크린리더 비친화 → 텍스트 요약 병기 */}
          <p className="sr-only">
            {data.map((d) => `${fmt(d.bucket)} 신규 가입 ${d.signups}, 저장 ${d.saves}`).join('; ')}
          </p>
        </>
      )}
    </section>
  )
}
