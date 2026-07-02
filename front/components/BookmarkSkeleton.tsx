export function BookmarkSkeleton() {
  return (
    <div
      role="status"
      aria-label="북마크 로딩 중"
      className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-[0_4px_14px_-8px_rgba(15,23,42,.12)] dark:border-gray-700 dark:bg-gray-900"
    >
      <span className="sr-only">로딩 중...</span>
      {/* 파비콘 + 제목 */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      </div>
      {/* URL */}
      <div className="h-3 w-1/2 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
      {/* 태그 */}
      <div className="flex gap-2">
        <div className="h-5 w-12 animate-pulse rounded-[5px] bg-gray-100 dark:bg-gray-800" />
        <div className="h-5 w-16 animate-pulse rounded-[5px] bg-gray-100 dark:bg-gray-800" />
        <div className="h-5 w-10 animate-pulse rounded-[5px] bg-gray-100 dark:bg-gray-800" />
      </div>
      {/* 저장일 */}
      <div className="mt-auto h-3 w-24 animate-pulse rounded border-t border-gray-100 bg-gray-100 pt-2.5 dark:border-gray-800 dark:bg-gray-800" />
    </div>
  )
}
