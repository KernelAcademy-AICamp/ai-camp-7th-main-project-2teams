import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'

const grantSchema = z.object({ email: z.string().trim().email() })
const userIdSchema = z.string().uuid()

export const GET = withAdmin(async () => {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('admin_list_admins')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const admins = ((data ?? []) as Array<{ user_id: string; email: string; granted_at: string }>).map((r) => ({
    userId: r.user_id,
    email: r.email,
    grantedAt: r.granted_at,
  }))
  return NextResponse.json({ admins })
})

export const POST = withAdmin(async (req, ctx) => {
  const parsed = grantSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('admin_grant_by_email', {
    p_email: parsed.data.email,
    p_granted_by: ctx.user.id,
  })
  if (error) {
    // RPC 'user not found'(no_data_found) 예외만 422. 그 외(RPC 자체 오류)에
    // 같은 문구를 쓰면 "이메일 없음"으로 오진단되므로 분리 + 로깅.
    // PostgREST는 plpgsql no_data_found를 SQLSTATE 'P0002'로 전달
    if (error.code === 'P0002') {
      return NextResponse.json({ error: '해당 이메일의 사용자를 찾을 수 없습니다' }, { status: 422 })
    }
    logger.error('[admin/admins] admin_grant_by_email 실패', error)
    return NextResponse.json({ error: `승격 실패: ${error.message}` }, { status: 500 })
  }
  const row = (data as Array<{ user_id: string; email: string }>)?.[0]
  return NextResponse.json({ admin: row ? { userId: row.user_id, email: row.email } : null })
})

export const DELETE = withAdmin(async (req, ctx) => {
  const userId = new URL(req.url).searchParams.get('userId')
  const parsed = userIdSchema.safeParse(userId)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid userId' }, { status: 400 })
  }
  // 본인 강등 방지(잠금아웃 회피)
  if (parsed.data === ctx.user.id) {
    return NextResponse.json({ error: '본인은 강등할 수 없습니다' }, { status: 400 })
  }
  const admin = createAdminClient()
  const { error } = await admin.rpc('admin_revoke', { p_user_id: parsed.data })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
})
