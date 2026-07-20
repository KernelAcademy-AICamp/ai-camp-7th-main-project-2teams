import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/admin-auth'
import { AdminDashboard } from '@/components/admin/AdminDashboard'

// 서버에서 먼저 관리자 게이트 — 비관리자는 404 (존재 은닉)
export default async function AdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await isAdmin(supabase))) {
    notFound()
  }

  return <AdminDashboard />
}
