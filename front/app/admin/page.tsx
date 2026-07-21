import { redirect } from 'next/navigation'

// /admin 진입 시 기본 성장 지표 탭으로 이동 (게이트는 layout.tsx에서 처리)
export default function AdminPage() {
  redirect('/admin/growth')
}
