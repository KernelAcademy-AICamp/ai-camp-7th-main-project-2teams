'use client'

import { useLocalStorage } from 'usehooks-ts'
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
  // initializeWithValue: false — 서버는 localStorage에 접근 불가해 항상 빈 배열을 렌더.
  // 기본값(true)이면 클라이언트 첫 렌더(hydration)에서 곧장 실제 저장값을 읽어 서버 출력과 달라져
  // hydration mismatch가 난다. false로 두면 최초 렌더는 서버와 동일하게 빈 배열, 마운트 후 훅 내부
  // useEffect가 실값으로 재동기화한다.
  const [recentSearches, setRecentSearches] = useLocalStorage<string[]>(RECENT_SEARCHES_KEY, [], {
    initializeWithValue: false,
  })

  const commitRecentSearch = (query: string) => {
    setRecentSearches((prev) => [query, ...prev.filter((q) => q !== query)].slice(0, MAX_RECENT_SEARCHES))
  }

  // 검색 실행 지점 단일화 — 폼 submit(검색 버튼 클릭 · 입력창 Enter)과 최근검색 칩 클릭만 여기로 들어온다.
  // 타이핑 중 자동검색(debounce)을 걷어낸 이유: 완성 전 부분 문자열마다 임베딩 API를 때려
  // 비용·지연이 늘고, 결과가 타이핑 도중 계속 바뀌어 읽을 수 없었다.
  const runSearch = (rawQuery: string) => {
    const query = rawQuery.trim()
    if (!query) {
      onClear()
      return
    }
    onSearch(query)
    // 최근 검색은 "실제로 검색한 것"만 기록 — 입력하다 만 문자열은 남지 않는다.
    commitRecentSearch(query)
  }

  // form onSubmit이므로 입력창 Enter는 브라우저가 자동으로 여기까지 태운다(별도 keydown 불필요).
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    runSearch(value)
  }

  const handleClear = () => {
    onChange('')
    onClear()
  }

  const handleRecentClick = (query: string) => {
    onChange(query)
    runSearch(query)
  }

  const removeRecentSearch = (query: string) => {
    setRecentSearches((prev) => prev.filter((q) => q !== query))
  }

  const showRecent = !value && recentSearches.length > 0
  const showStatus = isLoading || (value.trim() !== '' && typeof resultCount === 'number')

  return (
    <form role="search" aria-label="북마크 검색 영역" className="w-full" onSubmit={handleSubmit}>
      <div className="relative">
        <label htmlFor="bookmark-search" className="sr-only">
          북마크 검색
        </label>
        {/* [&::-webkit-search-cancel-button]:appearance-none — type=search의 브라우저 기본 지우기
            버튼 제거. 우측 커스텀 X 버튼과 겹쳐 X가 두 개로 보이던 문제. */}
        <input
          id="bookmark-search"
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="북마크 검색... (예: 리액트 훅 정리한 글)"
          className="h-12 w-full rounded-lg border border-line bg-white pl-4 pr-24 text-sm text-text-primary outline-none transition-all placeholder:text-text-secondary focus:border-brand focus:ring-2 focus:ring-brand/20 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {/* 지우기·검색을 입력창 오른쪽에 모은다 — 국내 검색 UI(네이버·카카오·쿠팡)의 통용 배치 */}
        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {isLoading ? (
            <span
              aria-hidden
              className="mr-1 h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand/25 border-t-brand"
            />
          ) : (
            value && (
              // type="button" 필수 — 기본값 submit이라 지우기가 검색을 트리거한다.
              <button
                type="button"
                onClick={handleClear}
                aria-label="검색어 지우기"
                className="cursor-pointer rounded-md p-1.5 text-text-secondary transition-colors hover:text-text-primary"
              >
                <X size={14} />
              </button>
            )
          )}
          <button
            type="submit"
            aria-label="검색"
            className="gradient-brand flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-white transition-transform hover:-translate-y-0.5"
          >
            <Search size={18} aria-hidden />
          </button>
        </div>
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
                onClick={() => handleRecentClick(query)}
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
    </form>
  )
}
