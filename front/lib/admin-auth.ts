import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { withAuth } from './auth'

// admin_users 테이블(마이그레이션 0027) + is_admin() RPC 기반 판별.
// 호출자의 세션(authenticated)으로 RPC 호출 — service_role 불필요.
export async function isAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_admin', { p_user_id: userId })
  if (error) return false
  return data === true
}

type AdminContext<P> = { user: User; supabase: SupabaseClient } & P

// withAuth(401) 위에 얹어 비관리자는 404로 은닉.
export function withAdmin<P = unknown>(
  handler: (req: Request, ctx: AdminContext<P>) => Promise<Response> | Response
) {
  return withAuth<P>(async (req, ctx) => {
    if (!(await isAdmin(ctx.supabase, ctx.user.id))) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 })
    }
    return handler(req, ctx)
  })
}
