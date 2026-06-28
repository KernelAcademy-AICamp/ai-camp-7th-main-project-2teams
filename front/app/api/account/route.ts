import { createHash } from 'crypto'
import { withAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

// A14: 회원 탈퇴 — 북마크 전체 삭제 후 Auth 유저 삭제
export const DELETE = withAuth(async (_req, { user, supabase }) => {
  // 1. 북마크 전체 삭제 (RLS: 본인 데이터만)
  const { error: bookmarkError } = await supabase
    .from('bookmarks')
    .delete()
    .eq('user_id', user.id)

  if (bookmarkError) {
    return Response.json({ error: bookmarkError.message }, { status: 500 })
  }

  // 2. Auth 유저 삭제 (service_role 필요)
  const admin = createAdminClient()
  const { error: authError } = await admin.auth.admin.deleteUser(user.id)

  if (authError) {
    return Response.json({ error: authError.message }, { status: 500 })
  }

  // 3. 파기 완료 로그 — user_id 해시 앞 16자리만 (식별 정보 미포함)
  const userHash = createHash('sha256').update(user.id).digest('hex').slice(0, 16)
  console.log(`[account] user deleted: hash=${userHash}`)

  return Response.json({ success: true })
})

// A15: 개인정보 열람 (미구현)
export const GET = withAuth(async () => {
  return Response.json({ error: 'Not implemented' }, { status: 501 })
})
