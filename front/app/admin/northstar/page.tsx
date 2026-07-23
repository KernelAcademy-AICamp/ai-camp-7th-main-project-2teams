import { NorthStarMetrics } from '@/components/admin/NorthStarMetrics'

// North Star 주간 지표 전용 탭 (게이트는 상위 layout.tsx). 주간 고정이라 range 토글과 무관 —
// AdminTabs가 이 경로에서 range 토글을 숨긴다.
export default function AdminNorthStarPage() {
  return <NorthStarMetrics />
}
