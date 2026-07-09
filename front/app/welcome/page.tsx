import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ServiceFeatures } from '@/components/ServiceFeatures'

export const metadata = {
  title: 'Mowaba — AI 북마크 관리',
}

/**
 * 랜딩 페이지 — 전체 유저(비로그인/로그인) 접근 가능 (PUBLIC_PATHS)
 * 인증 상태에 따라 하단 CTA 분기: 비로그인 → 로그인, 로그인 → 대시보드
 */
export default async function WelcomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-line bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-4xl items-center px-4">
          <span className="text-lg font-bold tracking-tight text-brand">
            Mowaba
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            저장한 북마크를 AI가 자동으로 정리합니다
          </h1>
          <p className="mt-2 text-text-secondary">
            태그·카테고리 자동 분류, 자연어 검색까지 한 번에.
          </p>
        </div>

        <ServiceFeatures />

        {/* 인증 상태별 CTA 분기 */}
        <div className="mt-10 flex justify-center">
          {user ? (
            <Link
              href="/"
              className="gradient-brand rounded-xl px-8 py-3 font-semibold text-white shadow-[0_10px_20px_-6px_rgba(74,144,226,.5)] transition-transform hover:-translate-y-px"
            >
              대시보드로 이동
            </Link>
          ) : (
            <Link
              href="/login"
              className="gradient-brand rounded-xl px-8 py-3 font-semibold text-white shadow-[0_10px_20px_-6px_rgba(74,144,226,.5)] transition-transform hover:-translate-y-px"
            >
              시작하기
            </Link>
          )}
        </div>
      </main>
    </div>
  )
}
