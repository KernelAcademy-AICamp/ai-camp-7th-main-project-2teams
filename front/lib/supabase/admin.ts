import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Service Role 클라이언트 — Route Handler 서버사이드에서만 호출
// A14 탈퇴 처리 전용. 클라이언트 컴포넌트에서 절대 사용 금지.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
