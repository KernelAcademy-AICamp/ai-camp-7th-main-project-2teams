import { createHash } from 'crypto'
import { withAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

// A14: 회원 탈퇴 — Auth 유저 삭제 (bookmarks는 ON DELETE CASCADE로 자동 파기)
// bookmarks 먼저 삭제 시 deleteUser 실패하면 계정만 남는 비원자성 문제 방지
export const DELETE = withAuth(async (_req, { user }) => {
  const userHash = createHash('sha256').update(user.id).digest('hex').slice(0, 16)
  const admin = createAdminClient()
  const { error: authError } = await admin.auth.admin.deleteUser(user.id)

  if (authError) {
    console.error(`[account] deleteUser 실패: hash=${userHash}`, authError.message)
    return Response.json({ error: '회원 탈퇴 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }

  console.log(`[account] user deleted: hash=${userHash}`)
  return Response.json({ success: true })
})

// A15: 개인정보 열람 — 개보법 35조 열람권 대응
export const GET = withAuth(async (_req, { supabase }) => {
  // embedding 제외, 전체 반환 (다운로드 용도 — 페이지네이션 없음)
  const { data, error } = await supabase
    .from('bookmarks')
    .select('id, title, url, tags, category_id, folder_hint, is_favorite, created_at')
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ bookmarks: data })
})
