'use client'

import { BookmarkCard } from '@/components/BookmarkCard'
import { BookmarkSkeleton } from '@/components/BookmarkSkeleton'
import { useBookmarks } from '@/hooks/useBookmarks'

export default function DashboardPage() {
  const { data, isPending, isError, refetch } = useBookmarks({})

  if (isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <BookmarkSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
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
    )
  }

  const bookmarks = data?.bookmarks ?? []

  if (bookmarks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
          저장된 북마크가 없습니다
        </p>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Chrome Extension으로 페이지를 저장하면 여기에 표시됩니다.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {bookmarks.map((bookmark) => (
        <BookmarkCard key={bookmark.id} bookmark={bookmark} />
      ))}
    </div>
  )
}
