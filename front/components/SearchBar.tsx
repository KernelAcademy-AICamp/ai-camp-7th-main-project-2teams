'use client'

import { useState, useEffect, useRef } from 'react'
import { useDebounceValue } from 'usehooks-ts'
import { Search, X } from 'lucide-react'

interface SearchBarProps {
  onSearch: (query: string) => void
  onClear: () => void
}

export function SearchBar({ onSearch, onClear }: SearchBarProps) {
  const [value, setValue] = useState('')
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
    setValue('')
    onClear()
  }

  return (
    <div role="search" aria-label="북마크 검색 영역" className="relative w-full">
      <Search
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        aria-hidden
      />
      <label htmlFor="bookmark-search" className="sr-only">
        북마크 검색
      </label>
      <input
        id="bookmark-search"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="북마크 검색..."
        className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
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
