'use client'

import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useFilterStore } from '@/store/filterStore'
import type { Bookmark } from '@/hooks/useBookmarks'

const FIXED_CATEGORIES = ['개발', 'AI/ML', '디자인', '비즈니스', '학습', '쇼핑'] as const

export function aggregateTags(bookmarks: Bookmark[], limit = 20): string[] {
  const counts: Record<string, number> = {}
  for (const b of bookmarks) {
    for (const t of b.tags) counts[t] = (counts[t] ?? 0) + 1
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag)
}

interface SidebarProps {
  bookmarks: Bookmark[]
}

export function Sidebar({ bookmarks }: SidebarProps) {
  const { category, tag, tab, setCategory, setTag, setTab } = useFilterStore(
    useShallow((s) => ({
      category: s.category,
      tag: s.tag,
      tab: s.tab,
      setCategory: s.setCategory,
      setTag: s.setTag,
      setTab: s.setTab,
    }))
  )

  const tags = useMemo(() => aggregateTags(bookmarks), [bookmarks])

  const handleCategory = (name: string) => {
    setCategory(category === name ? null : name)
    setTag(null)
  }

  const handleTag = (name: string) => {
    setTag(tag === name ? null : name)
    setCategory(null)
  }

  return (
    <nav aria-label="북마크 필터" className="flex w-48 shrink-0 flex-col gap-6">
      {/* 전체 / 즐겨찾기 탭 — 카테고리 버튼과 동일하게 aria-pressed 사용 */}
      <section>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
          {(['all', 'favorites'] as const).map((t) => (
            <button
              key={t}
              aria-pressed={tab === t}
              onClick={() => {
                setTab(t)
                // 탭 전환 시 category/tag 리셋 (handleCategory/handleTag와 동일 패턴)
                setCategory(null)
                setTag(null)
              }}
              className={[
                'flex-1 rounded-md px-2 py-1 text-sm font-medium transition-colors',
                tab === t
                  ? 'bg-white text-gray-900 shadow dark:bg-gray-700 dark:text-gray-100'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
              ].join(' ')}
            >
              {t === 'all' ? '전체' : '즐겨찾기'}
            </button>
          ))}
        </div>
      </section>

      {/* 카테고리 */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
          카테고리
        </h2>
        <ul className="flex flex-col gap-0.5">
          {FIXED_CATEGORIES.map((name) => (
            <li key={name}>
              <button
                onClick={() => handleCategory(name)}
                aria-pressed={category === name}
                className={[
                  'w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                  category === name
                    ? 'bg-indigo-100 font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
                ].join(' ')}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* 태그 */}
      {tags.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            태그
          </h2>
          <ul className="flex flex-wrap gap-1.5">
            {tags.map((name) => (
              <li key={name}>
                <button
                  onClick={() => handleTag(name)}
                  aria-pressed={tag === name}
                  className={[
                    'rounded-full px-2.5 py-0.5 text-xs transition-colors',
                    tag === name
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700',
                  ].join(' ')}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </nav>
  )
}
