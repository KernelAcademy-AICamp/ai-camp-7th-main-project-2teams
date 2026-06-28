import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'

// 서버 컴포넌트 / Route Handler용 Supabase 클라이언트
export async function createClient() {
  // Next.js 16: cookies()가 async
  const cookieStore = await cookies()

  // 익스텐션 등 쿠키 없는 클라이언트는 Authorization: Bearer 헤더로 인증.
  // 헤더 토큰을 global에 주입 → getUser() 검증 + PostgREST RLS(auth.uid()) 둘 다 적용.
  const authHeader = (await headers()).get('authorization')

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(authHeader
        ? { global: { headers: { Authorization: authHeader } } }
        : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component에서 호출 시 무시 (읽기 전용 컨텍스트)
          }
        },
      },
    }
  )
}
