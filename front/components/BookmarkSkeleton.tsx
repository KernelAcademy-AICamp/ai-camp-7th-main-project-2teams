interface BookmarkSkeletonProps {
  view?: "grid" | "list" | "compact"
}

// BookmarkCard 3종 뷰(그리드/리스트/컴팩트)와 동일한 구조·border-radius 유지 — 뷰 전환 시 스켈레톤도 같이 바뀜.
export function BookmarkSkeleton({ view = "grid" }: BookmarkSkeletonProps) {
  if (view === "compact") {
    return (
      <div role="status" aria-label="북마크 로딩 중" className="flex items-center gap-3 px-3 py-2">
        <span className="sr-only">로딩 중...</span>
        <div className="h-5 w-5 shrink-0 animate-pulse rounded bg-gray-200" />
        <div className="h-4 flex-1 animate-pulse rounded bg-gray-200" />
        <div className="hidden h-3 w-20 shrink-0 animate-pulse rounded bg-gray-200 sm:block" />
      </div>
    )
  }

  if (view === "list") {
    return (
      <div
        role="status"
        aria-label="북마크 로딩 중"
        className="flex items-center gap-4 rounded-md border border-line bg-white p-4"
      >
        <span className="sr-only">로딩 중...</span>
        <div className="h-12 w-12 shrink-0 animate-pulse rounded-xl bg-gray-200" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-gray-200" />
        </div>
      </div>
    )
  }

  return (
    <div
      role="status"
      aria-label="북마크 로딩 중"
      className="flex flex-col overflow-hidden rounded-md bg-gray-900 shadow-lg"
    >
      <span className="sr-only">로딩 중...</span>
      {/* 썸네일 */}
      <div className="aspect-video w-full shrink-0 animate-pulse bg-gray-800" />

      {/* 정보 패널 */}
      <div className="flex flex-col gap-2 p-4">
        {/* 제목 */}
        <div className="h-5 w-3/4 animate-pulse rounded bg-gray-700" />
        {/* 설명 */}
        <div className="h-4 w-full animate-pulse rounded bg-gray-800" />
        {/* 도메인 */}
        <div className="h-4 w-1/3 animate-pulse rounded bg-gray-800" />
        {/* 태그 */}
        <div className="flex gap-1.5 pt-1">
          <div className="h-5 w-12 animate-pulse rounded-full bg-gray-800" />
          <div className="h-5 w-16 animate-pulse rounded-full bg-gray-800" />
        </div>
        {/* 저장일 */}
        <div className="mt-auto h-3 w-24 animate-pulse rounded border-t border-white/10 bg-gray-800 pt-2.5" />
      </div>
    </div>
  )
}
