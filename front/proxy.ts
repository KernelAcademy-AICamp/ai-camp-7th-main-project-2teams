import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// 인증 없이 접근 가능한 공개 경로 목록
const PUBLIC_PATHS = ['/login', '/auth', '/privacy', '/terms', '/goodbye', '/welcome']

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname.startsWith(p))
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getSession() 대신 getUser() 사용 — 서버사이드 토큰 검증
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL('/welcome', request.url))
  }

  return supabaseResponse
}

export const config = {
  // api 제외: API 라우트는 withAuth가 401 JSON 응답. 미들웨어 302 redirect 시
  // 익스텐션 등 fetch 클라이언트가 HTML 로그인 페이지를 받게 됨.
  // demo 제외: public/demo의 정적 GIF 등은 비로그인 방문자도 보는 /welcome 랜딩에 쓰여
  // 인증 리다이렉트 대상에서 제외해야 함(안 그러면 이미지 요청 자체가 /welcome으로 307됨).
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|demo).*)'],
}
