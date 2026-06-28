'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'

function LoginContent() {
  const searchParams = useSearchParams()
  const fromExtension = searchParams.get('from') === 'extension'

  // Google OAuth 전용 (CLAUDE.md). 이메일/비밀번호 로그인 없음.
  const signInWithGoogle = async () => {
    const supabase = createClient()
    const callbackUrl = fromExtension
      ? `${location.origin}/auth/callback?from=extension`
      : `${location.origin}/auth/callback`
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl },
    })
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-bold">북마크 AI</h1>
      <button
        type="button"
        onClick={signInWithGoogle}
        className="rounded-md border border-gray-300 px-6 py-3 font-medium hover:bg-gray-50"
      >
        Google로 계속하기
      </button>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
