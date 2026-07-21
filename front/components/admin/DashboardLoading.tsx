import { Loader2 } from 'lucide-react'

// 어드민 대시보드 데이터 로딩 스피너 (성장/운영 공용)
export function DashboardLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 py-16 text-sm text-text-secondary"
    >
      <Loader2 className="h-4 w-4 animate-spin text-brand" aria-hidden />
      <span>불러오는 중…</span>
    </div>
  )
}
