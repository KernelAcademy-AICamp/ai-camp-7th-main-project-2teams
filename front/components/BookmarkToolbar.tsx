'use client'

import { LayoutGrid, List, Rows3, ArrowDownUp } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useFilterStore } from '@/store/filterStore'

// 북마크 목록 상단 툴바 — 정렬(최신/오래된) 토글 + 뷰(그리드/리스트) 전환.
// 상태는 filterStore(sortOrder·viewMode) 단일 출처.
export function BookmarkToolbar() {
  const { sortOrder, viewMode, setSortOrder, setViewMode } = useFilterStore(
    useShallow((s) => ({
      sortOrder: s.sortOrder,
      viewMode: s.viewMode,
      setSortOrder: s.setSortOrder,
      setViewMode: s.setViewMode,
    }))
  )

  return (
    <div className="flex items-center justify-end gap-2">
      {/* 정렬 토글 */}
      <button
        onClick={() => setSortOrder(sortOrder === 'latest' ? 'oldest' : 'latest')}
        className="flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        aria-label="정렬 순서 전환"
      >
        <ArrowDownUp size={14} />
        {sortOrder === 'latest' ? '최신순' : '오래된순'}
      </button>

      {/* 뷰 전환 — 그리드/리스트/컴팩트 */}
      <div className="flex gap-0.5 rounded-md border border-gray-200 p-0.5 dark:border-gray-700">
        {([
          { mode: 'grid', label: '그리드 보기', Icon: LayoutGrid },
          { mode: 'list', label: '리스트 보기', Icon: List },
          { mode: 'compact', label: '컴팩트 보기', Icon: Rows3 },
        ] as const).map(({ mode, label, Icon }) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            aria-label={label}
            aria-pressed={viewMode === mode}
            className={[
              'rounded p-1 transition-colors',
              viewMode === mode
                ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200',
            ].join(' ')}
          >
            <Icon size={16} />
          </button>
        ))}
      </div>
    </div>
  )
}
