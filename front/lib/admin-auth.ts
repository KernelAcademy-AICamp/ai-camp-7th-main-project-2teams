import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { withAuth } from './auth'

// ADMIN_USER_IDS: 쉼표 구분 allowlist (서버 전용, NEXT_PUBLIC_ 금지)
function adminIds(): Set<string> {
  return new Set(
    (process.env.ADMIN_USER_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )
}

export function isAdmin(userId: string): boolean {
  return adminIds().has(userId)
}

type AdminContext<P> = { user: User; supabase: SupabaseClient } & P

// withAuth(401) 위에 얹어 비관리자는 404로 은닉.
export function withAdmin<P = unknown>(
  handler: (req: Request, ctx: AdminContext<P>) => Promise<Response> | Response
) {
  return withAuth<P>(async (req, ctx) => {
    if (!isAdmin(ctx.user.id)) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 })
    }
    return handler(req, ctx)
  })
}
