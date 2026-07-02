'use client'

import { useEffect, useRef } from 'react'
import { useDebounceValue } from 'usehooks-ts'
import { Search, X } from 'lucide-react'

interface SearchBarProps {
  onSearch: (query: string) => void
  onClear: () => void
  value: string
  onChange: (value: string) => void
}

export function SearchBar({ onSearch, onClear, value, onChange }: SearchBarProps) {
  const [debounced] = useDebounceValue(value, 300)
  const isMounted = useRef(false)

  useEffect(() => {
    // 마운트 시 최초 실행 건너뜀 — 빈 문자열로 onClear 의도치 않게 호출 방지
    if (!isMounted.current) {
      isMounted.current = true
      return
    }
    if (debounced.trim()) {
      onSearch(debounced.trim())
    } else {
      onClear()
    }
  }, [debounced, onSearch, onClear])

  const handleClear = () => {
    onChange('')
    onClear()
  }

  return (
    <div role="search" aria-label="북마크 검색 영역" className="relative w-full">
      <Search
        size={16}
        className="absolute left-4 top-1/2 -translate-y-1/2 text-teal-600"
        aria-hidden
      />
      <label htmlFor="bookmark-search" className="sr-only">
        북마크 검색
      </label>
      <input
        id="bookmark-search"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="북마크 검색..."
        className="w-full rounded-full border border-gray-200 bg-[#F1F5F9] py-2.5 pl-10 pr-10 text-sm outline-none transition-colors focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-600/10 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      />
      {value && (
        <button
          onClick={handleClear}
          aria-label="검색어 지우기"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
