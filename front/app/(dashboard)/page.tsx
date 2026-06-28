'use client'

import { useState, useCallback } from 'react'
import { BookmarkCard } from '@/components/BookmarkCard'
import { BookmarkSkeleton } from '@/components/BookmarkSkeleton'
import { SearchBar } from '@/components/SearchBar'
import { useBookmarks } from '@/hooks/useBookmarks'
import { useSearch } from '@/hooks/useSearch'

export default function DashboardPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const isSearching = searchQuery.trim().length > 0

  const { data: bookmarkData, isPending: isBookmarkPending, isError: isBookmarkError, refetch } = useBookmarks({})
  const { mutate: search, data: searchData, isPending: isSearchPending, isError: isSearchError } = useSearch()

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query)
    search(query)
  }, [search])

  const handleClear = useCallback(() => {
    setSearchQuery('')
  }, [])

  const isPending = isSearching ? isSearchPending : isBookmarkPending
  const items = isSearching ? (searchData?.results ?? []) : (bookmarkData?.bookmarks ?? [])

  return (
    <div className="flex flex-col gap-4">
      <SearchBar onSearch={handleSearch} onClear={handleClear} />

      {isPending && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <BookmarkSkeleton key={i} />
          ))}
        </div>
      )}

      {!isPending && isBookmarkError && !isSearching && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            북마크를 불러오는 중 오류가 발생했습니다.
          </p>
          <button
            onClick={() => refetch()}
            className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
          >
            다시 시도
          </button>
        </div>
      )}

      {!isPending && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          {isSearching && isSearchError && !isSearchPending && (
        <p className="text-center text-sm text-red-500">
          검색 중 오류가 발생했습니다. 다시 시도해 주세요.
        </p>
      )}

      {isSearching ? (
            <>
              <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
                검색 결과가 없습니다
              </p>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                다른 검색어로 시도해 보세요.
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
                저장된 북마크가 없습니다
              </p>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Chrome Extension으로 페이지를 저장하면 여기에 표시됩니다.
              </p>
            </>
          )}
        </div>
      )}

      {!isPending && items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <BookmarkCard key={item.id} bookmark={item} />
          ))}
        </div>
      )}
    </div>
  )
}
