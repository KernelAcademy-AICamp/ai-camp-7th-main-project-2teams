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
  const { category, tag, setCategory, setTag } = useFilterStore(
    useShallow((s) => ({
      category: s.category,
      tag: s.tag,
      setCategory: s.setCategory,
      setTag: s.setTag,
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
