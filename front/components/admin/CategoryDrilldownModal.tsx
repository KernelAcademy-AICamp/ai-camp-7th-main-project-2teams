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

  // 세 가지 상태(로딩/에러/성공)를 구분하기 위해 error 케이스에도 category를 함께 저장
  // — 에러가 어느 category에서 발생했는지 알아야 category 전환 시 stale 에러를 걸러낼 수 있음
  type Result = { category: string; tags: TagStat[] } | { category: string; error: true } | null
  const [result, setResult] = useState<Result>(null)

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
        if (alive) setResult({ category, error: true })
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

  // result가 현재 category에 대한 것일 때만 신뢰 — 이전 category의 stale 에러/데이터 배제
  const isError = result !== null && 'error' in result && result.category === category
  const loading = !isError && (!result || result.category !== category)
  const data: DonutDatum[] =
    !loading && result && 'tags' in result ? result.tags.map((t) => ({ label: t.tag, value: t.count, pct: t.pct })) : []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-drilldown-title"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-line bg-surface-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between p-5 pb-4">
          <h3 id="category-drilldown-title" className="text-base font-semibold text-text-primary">
            <span>{category}</span> · 하위 태그
          </h3>
          <button
            type="button"
            aria-label="닫기"
            onClick={close}
            className="text-text-secondary hover:text-text-primary"
          >
            ✕
          </button>
        </div>
        {/* 하위 태그 수에 따라 내용이 길어질 수 있어 헤더는 고정, 본문만 스크롤 */}
        <div className="overflow-y-auto px-5 pb-5">
          {loading ? (
            <p className="text-sm text-text-secondary">불러오는 중…</p>
          ) : isError ? (
            <p className="text-sm text-destructive">하위 태그를 불러오지 못했습니다</p>
          ) : (
            <DonutChart data={data} />
          )}
        </div>
      </div>
    </div>
  )
}
