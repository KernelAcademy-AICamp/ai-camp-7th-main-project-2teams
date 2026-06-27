import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient } from './supabase/server'

// Route Handler를 감싸 인증을 강제하는 HOF.
// 미인증 시 401, 인증 시 핸들러에 { user, supabase } 주입.
// 동적 라우트의 두 번째 인자(예: { params })는 그대로 전달.
type AuthContext<P> = { user: User; supabase: SupabaseClient } & P

export function withAuth<P = unknown>(
  handler: (req: Request, ctx: AuthContext<P>) => Promise<Response> | Response
) {
  return async (req: Request, routeCtx?: P) => {
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return handler(req, {
      user,
      supabase,
      ...((routeCtx ?? {}) as P),
    })
  }
}
