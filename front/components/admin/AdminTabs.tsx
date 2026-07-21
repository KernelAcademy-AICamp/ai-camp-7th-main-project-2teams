'use client'

import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { ADMIN_RANGES, parseRange, type AdminRange } from '@/lib/admin-range'

const TABS = [
  { href: '/admin/growth', label: '성장 지표' },
  { href: '/admin/ops', label: '운영·개발' },
] as const

// 어드민 상단 네비 — 성장/운영 탭 전환 + range 토글 (쿼리스트링 보존)
export function AdminTabs() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const range = parseRange(params.get('range'))
  const qs = params.toString()

  const setRange = (r: AdminRange) => {
    const next = new URLSearchParams(params)
    next.set('range', r)
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <div className="flex items-end justify-between border-b border-line pb-4">
      <div>
        <div className="text-xs font-medium tracking-wide text-text-secondary">내부 운영</div>
        <nav className="mt-1 flex gap-4" aria-label="어드민 섹션">
          {TABS.map((t) => {
            const active = pathname === t.href
            return (
              <Link
                key={t.href}
                href={qs ? `${t.href}?${qs}` : t.href}
                aria-current={active ? 'page' : undefined}
                className={`text-xl font-semibold transition-colors ${
                  active ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {t.label}
              </Link>
            )
          })}
        </nav>
      </div>
      <div className="flex gap-1 rounded-lg border border-line bg-surface-card p-1">
        {ADMIN_RANGES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={r === range}
            onClick={() => setRange(r)}
            className={`rounded-md px-3 py-1 text-sm transition-colors ${
              r === range ? 'bg-brand text-white' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  )
}
