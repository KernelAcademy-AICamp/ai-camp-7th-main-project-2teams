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
        size={18}
        className="absolute left-4 top-1/2 -translate-y-1/2 text-brand"
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
        className="h-12 w-full rounded-lg border border-line bg-white pl-11 pr-10 text-sm text-text-primary outline-none transition-all placeholder:text-text-secondary focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
      {value && (
        <button
          onClick={handleClear}
          aria-label="검색어 지우기"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
