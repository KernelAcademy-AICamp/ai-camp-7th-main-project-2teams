'use client'

import { useState, useCallback, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useShallow } from 'zustand/react/shallow'
import { BookmarkCard } from '@/components/BookmarkCard'
import { BookmarkSkeleton } from '@/components/BookmarkSkeleton'
import { SearchBar } from '@/components/SearchBar'
import { Sidebar } from '@/components/Sidebar'
import { useBookmarks } from '@/hooks/useBookmarks'
import { useSearch } from '@/hooks/useSearch'
import { useFilterStore } from '@/store/filterStore'

function DashboardContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const { category, tag, setCategory, setTag } = useFilterStore(
    useShallow((s) => ({
      category: s.category,
      tag: s.tag,
      setCategory: s.setCategory,
      setTag: s.setTag,
    }))
  )

  // URL 파라미터로 초기 필터 상태 복원 (마운트 1회)
  useEffect(() => {
    const urlCategory = searchParams.get('category')
    const urlTag = searchParams.get('tag')
    if (urlCategory) setCategory(urlCategory)
    if (urlTag) setTag(urlTag)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 마운트 첫 실행은 건너뛰어 초기화 Effect와 레이스 방지
  const syncInitRef = useRef(false)
  useEffect(() => {
    if (!syncInitRef.current) {
      syncInitRef.current = true
      return
    }
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (tag) params.set('tag', tag)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [category, tag, router, pathname])

  const [searchQuery, setSearchQuery] = useState('')
  const isSearching = searchQuery.trim().length > 0

  const {
    data: bookmarkData,
    isPending: isBookmarkPending,
    isError: isBookmarkError,
    refetch,
  } = useBookmarks({ category: category ?? undefined, tag: tag ?? undefined })

  const {
    mutate: search,
    data: searchData,
    isPending: isSearchPending,
    isError: isSearchError,
  } = useSearch()

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query)
      search(query)
    },
    [search]
  )

  const handleClear = useCallback(() => setSearchQuery(''), [])

  const isPending = isSearching ? isSearchPending : isBookmarkPending
  const items = isSearching ? (searchData?.results ?? []) : (bookmarkData?.bookmarks ?? [])
  const allBookmarks = bookmarkData?.bookmarks ?? []

  return (
    <>
      <Sidebar bookmarks={allBookmarks} />

      <main className="flex min-w-0 flex-1 flex-col gap-4">
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
              <p className="mb-3 text-sm text-red-500">
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
      </main>
    </>
  )
}

function DashboardFallback() {
  return (
    <>
      <div className="w-48 shrink-0" />
      <div className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <BookmarkSkeleton key={i} />
        ))}
      </div>
    </>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardContent />
    </Suspense>
  )
}
