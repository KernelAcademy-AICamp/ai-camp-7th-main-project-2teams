'use client'

import { BookmarkCard } from '@/components/BookmarkCard'
import { BookmarkSkeleton } from '@/components/BookmarkSkeleton'
import { useBookmarks } from '@/hooks/useBookmarks'

export default function DashboardPage() {
  const { data, isPending, isError } = useBookmarks({})

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
        <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
          잠시 후 다시 시도해 주세요.
        </p>
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
