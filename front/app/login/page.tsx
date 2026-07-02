'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import fullLogo from '@/assets/mowaba_logo.png'

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
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[#F1F5F9] px-6 dark:bg-gray-950">
      <div className="flex w-full max-w-sm flex-col items-center gap-8 rounded-2xl border border-[#E2E8F0] bg-white p-10 shadow-[0_24px_48px_-28px_rgba(15,23,42,.30)] dark:border-gray-800 dark:bg-gray-900">
        {/* 풀 로고 (Design.md Screen 1) */}
        <Image src={fullLogo} alt="Mowaba" width={180} height={48} priority className="h-auto w-44" />
        <p className="-mt-3 text-center text-sm text-gray-500 dark:text-gray-400">
          AI가 자동으로 정리하는 북마크
        </p>
        <button
          type="button"
          onClick={signInWithGoogle}
          className="gradient-brand w-full rounded-xl px-6 py-3 font-semibold text-white shadow-[0_10px_20px_-6px_rgba(15,118,110,.5)] transition-transform hover:-translate-y-px"
        >
          Google로 계속하기
        </button>
        <Link href="/welcome" className="text-sm text-gray-500 underline-offset-2 hover:underline dark:text-gray-400">
          서비스 소개 보기
        </Link>
      </div>
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
