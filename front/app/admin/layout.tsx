import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/admin-auth'
import { AdminTabs } from '@/components/admin/AdminTabs'

// 어드민 공통 게이트 — 비관리자는 404 (존재 은닉). 하위 growth/ops 페이지 공유
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await isAdmin(supabase))) {
    notFound()
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 bg-surface px-6 py-10 font-sans">
      <AdminTabs />
      {children}
    </main>
  )
}
