'use client'

import { useEffect, useRef } from 'react'
import { useDebounceValue, useLocalStorage } from 'usehooks-ts'
import { Search, X } from 'lucide-react'

const RECENT_SEARCHES_KEY = 'mowaba:recent-searches'
const MAX_RECENT_SEARCHES = 5

interface SearchBarProps {
  onSearch: (query: string) => void
  onClear: () => void
  value: string
  onChange: (value: string) => void
  /** 자연어 검색 진행 중 — 입력창 안에 스피너로 노출 (부모 useSearch의 isPending 전달) */
  isLoading?: boolean
  /** 검색 완료 후 결과수 — "N개 결과" 캡션. undefined면 캡션 미노출 */
  resultCount?: number
}

export function SearchBar({ onSearch, onClear, value, onChange, isLoading, resultCount }: SearchBarProps) {
  const [debounced] = useDebounceValue(value, 300)
  const isMounted = useRef(false)
  const [recentSearches, setRecentSearches] = useLocalStorage<string[]>(RECENT_SEARCHES_KEY, [])

  useEffect(() => {
    // 마운트 시 최초 실행 건너뜀 — 빈 문자열로 onClear 의도치 않게 호출 방지
    if (!isMounted.current) {
      isMounted.current = true
      return
    }
    const query = debounced.trim()
    if (query) {
      onSearch(query)
    } else {
      onClear()
    }
  }, [debounced, onSearch, onClear])

  // 최근 검색 저장은 자동검색(debounce) 트리거와 분리 — 타이핑 중 짧은 pause마다 여러 항목이
  // 쌓이는 문제를 막기 위해 사용자가 검색을 "완료"했다고 볼 수 있는 시점(Enter/blur)에만 기록.
  const commitRecentSearch = (rawQuery: string) => {
    const query = rawQuery.trim()
    if (!query) return
    setRecentSearches((prev) => [query, ...prev.filter((q) => q !== query)].slice(0, MAX_RECENT_SEARCHES))
  }

  const handleClear = () => {
    onChange('')
    onClear()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitRecentSearch(value)
    }
  }

  const handleBlur = () => {
    commitRecentSearch(value)
  }

  const removeRecentSearch = (query: string) => {
    setRecentSearches((prev) => prev.filter((q) => q !== query))
  }

  const showRecent = !value && recentSearches.length > 0
  const showStatus = isLoading || (value.trim() !== '' && typeof resultCount === 'number')

  return (
    <div role="search" aria-label="북마크 검색 영역" className="w-full">
      <div className="relative">
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
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder="북마크 검색... (예: 리액트 훅 정리한 글)"
          className="h-12 w-full rounded-lg border border-line bg-white pl-11 pr-10 text-sm text-text-primary outline-none transition-all placeholder:text-text-secondary focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        {isLoading ? (
          <span
            aria-hidden
            className="absolute right-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-brand/25 border-t-brand"
          />
        ) : (
          value && (
            <button
              onClick={handleClear}
              aria-label="검색어 지우기"
              className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-text-secondary hover:text-text-primary"
            >
              <X size={14} />
            </button>
          )
        )}
      </div>

      {showStatus && (
        <p className="mt-1.5 text-xs text-text-secondary" aria-live="polite">
          {isLoading ? 'AI가 문장을 이해하는 중...' : `${resultCount}개 결과`}
        </p>
      )}

      {showRecent && (
        <div
          className="mt-2 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }}
        >
          <span className="shrink-0 text-xs text-text-secondary">최근 검색</span>
          {recentSearches.map((query) => (
            <span
              key={query}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-mint-soft py-1 pl-2.5 pr-1.5 text-xs font-medium text-ink transition-colors hover:bg-mint/20"
            >
              <button
                type="button"
                onClick={() => onChange(query)}
                className="cursor-pointer"
              >
                {query}
              </button>
              <button
                type="button"
                onClick={() => removeRecentSearch(query)}
                aria-label={`${query} 최근 검색어 삭제`}
                className="cursor-pointer text-text-secondary hover:text-text-primary"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
