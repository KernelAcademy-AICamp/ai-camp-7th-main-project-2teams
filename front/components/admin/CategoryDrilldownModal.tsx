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

  const [tags, setTags] = useState<TagStat[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!category) return
    let alive = true
    setLoading(true)
    fetch(`/api/admin/stats?range=${range}&category=${encodeURIComponent(category)}`)
      .then((r) => r.json())
      .then((body) => {
        if (alive) setTags(body.tags ?? [])
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [category, range])

  if (!category) return null

  const close = () => router.push(`${pathname}?range=${range}`)
  const data: DonutDatum[] = tags.map((t) => ({ label: t.tag, value: t.count, pct: t.pct }))

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
