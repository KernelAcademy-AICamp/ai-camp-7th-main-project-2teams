// 사이드바 카테고리/폴더 목록 로딩 스켈레톤 — 항목 pop-in 깜빡임 제거
export function SidebarSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul role="status" aria-label="목록 로딩 중" className="flex flex-col gap-0.5">
      <span className="sr-only">로딩 중...</span>
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="px-3 py-1.5">
          <div
            className="h-4 animate-pulse rounded bg-gray-200"
            // 길이 변주로 목록처럼 보이게
            style={{ width: `${60 + ((i * 13) % 35)}%` }}
          />
        </li>
      ))}
    </ul>
  )
}
