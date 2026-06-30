import { createBrowserClient } from '@supabase/ssr'

// 탭 내 단일 인스턴스 보장 — 여러 컴포넌트가 createClient()를 동시 호출해도
// GoTrueClient 1개만 생성. 다중 인스턴스가 단일사용 refresh token 회전을
// 레이스로 무효화해 로그인 직후 세션이 풀리는 버그 방지.
let browserClient: ReturnType<typeof createBrowserClient> | undefined

// 클라이언트 컴포넌트용 Supabase 클라이언트 — NEXT_PUBLIC_ 키만 사용
export function createClient() {
  if (browserClient) return browserClient
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  return browserClient
}
