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

  // 세 가지 상태(로딩/에러/성공)를 구분하기 위해 result에 'error' 케이스를 추가
  const [result, setResult] = useState<{ category: string; tags: TagStat[] } | 'error' | null>(null)

  useEffect(() => {
    if (!category) return
    let alive = true
    fetch(`/api/admin/stats?range=${range}&category=${encodeURIComponent(category)}`)
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json()
      })
      .then((body) => {
        if (alive) setResult({ category, tags: body.tags ?? [] })
      })
      .catch(() => {
        if (alive) setResult('error')
      })
    return () => {
      alive = false
    }
  }, [category, range])

  const close = () => {
    const next = new URLSearchParams(params)
    next.delete('category')
    router.push(`${pathname}?${next.toString()}`)
  }

  // Escape 키로 닫기 — EditBookmarkModal/AddBookmarkModal과 동일 패턴
  useEffect(() => {
    if (!category) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  })

  if (!category) return null

  const isError = result === 'error'
  const loading = !isError && (!result || result.category !== category)
  const data: DonutDatum[] =
    !loading && !isError && result ? result.tags.map((t) => ({ label: t.tag, value: t.count, pct: t.pct })) : []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-drilldown-title"
    >
      <div
        className="w-full max-w-lg rounded-xl bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id="category-drilldown-title" className="text-base font-semibold">
            <span>{category}</span> · 하위 태그
          </h3>
          <button type="button" aria-label="닫기" onClick={close} className="text-muted-foreground">
            ✕
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        ) : isError ? (
          <p className="text-sm text-destructive">하위 태그를 불러오지 못했습니다</p>
        ) : (
          <DonutChart data={data} />
        )}
      </div>
    </div>
  )
}
