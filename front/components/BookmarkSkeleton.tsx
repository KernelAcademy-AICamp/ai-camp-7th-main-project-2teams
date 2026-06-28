export function BookmarkSkeleton() {
  return (
    <div
      role="status"
      aria-label="북마크 로딩 중"
      className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
    >
      <span className="sr-only">로딩 중...</span>
      {/* 제목 */}
      <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      {/* URL */}
      <div className="h-3 w-1/2 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
      {/* 태그 */}
      <div className="flex gap-2">
        <div className="h-5 w-12 animate-pulse rounded-full bg-indigo-50 dark:bg-indigo-900/20" />
        <div className="h-5 w-16 animate-pulse rounded-full bg-indigo-50 dark:bg-indigo-900/20" />
        <div className="h-5 w-10 animate-pulse rounded-full bg-indigo-50 dark:bg-indigo-900/20" />
      </div>
      {/* 저장일 */}
      <div className="h-3 w-24 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
    </div>
  )
}
