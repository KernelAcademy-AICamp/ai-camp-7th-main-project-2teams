import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// OAuth 콜백 — Google 인증 후 code를 세션으로 교환
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // 상대 경로만 허용 — '//' 시작 및 '@' 포함 차단 (open redirect 방지)
  const rawNext = searchParams.get('next') ?? '/'
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.includes('@')
    ? rawNext
    : '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const from = searchParams.get('from')
      const dest = from === 'extension' ? `${origin}/?from=extension` : `${origin}${next}`
      return NextResponse.redirect(dest)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
