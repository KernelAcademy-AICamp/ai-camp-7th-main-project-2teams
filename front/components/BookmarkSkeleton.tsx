// BookmarkCard 그리드 뷰(다크 미디어 카드)와 동일한 구조 — 썸네일 상단 + 다크 정보 패널.
export function BookmarkSkeleton() {
  return (
    <div
      role="status"
      aria-label="북마크 로딩 중"
      className="flex flex-col overflow-hidden rounded-2xl bg-gray-900 shadow-lg"
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
