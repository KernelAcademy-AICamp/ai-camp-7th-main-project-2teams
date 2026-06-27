import { NextResponse } from 'next/server'

// A4에서 OAuth 콜백 핸들러 구현 예정
// 현재는 /login으로 fallback
export async function GET(request: Request) {
  const { origin } = new URL(request.url)
  return NextResponse.redirect(`${origin}/login`)
}
