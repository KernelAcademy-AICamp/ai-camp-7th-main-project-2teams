'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { DonutChart, type DonutDatum } from './DonutChart'
import type { AdminRange } from '@/lib/admin-range'

type TagStat = { tag: string; count: number; pct: number }

export function CategoryDrilldownModal({ range }: { range: AdminRange }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const category = params.get('category')

  // 로딩 여부는 별도 state 대신 "현재 category에 대한 응답이 아직 없음"으로 파생
  // (react-hooks/set-state-in-effect 회피: effect 본문에서 setState를 동기 호출하지 않음)
  const [result, setResult] = useState<{ category: string; tags: TagStat[] } | null>(null)

  useEffect(() => {
    if (!category) return
    let alive = true
    fetch(`/api/admin/stats?range=${range}&category=${encodeURIComponent(category)}`)
      .then((r) => r.json())
      .then((body) => {
        if (alive) setResult({ category, tags: body.tags ?? [] })
      })
    return () => {
      alive = false
    }
  }, [category, range])

  if (!category) return null

  const loading = !result || result.category !== category
  const close = () => router.push(`${pathname}?range=${range}`)
  const data: DonutDatum[] = loading
    ? []
    : result.tags.map((t) => ({ label: t.tag, value: t.count, pct: t.pct }))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={close}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">
            <span>{category}</span> · 하위 태그
          </h3>
          <button type="button" aria-label="닫기" onClick={close} className="text-muted-foreground">
            ✕
          </button>
        </div>
        {loading ? <p className="text-sm text-muted-foreground">불러오는 중…</p> : <DonutChart data={data} />}
      </div>
    </div>
  )
}
