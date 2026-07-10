import Link from 'next/link'
import { Check, Search, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ServiceFeatures } from '@/components/ServiceFeatures'

export const metadata = {
  title: 'Mowaba — AI 북마크 관리',
}

const TRUST_ITEMS = [
  'Google·Kakao 로그인',
  '브라우저 북마크 가져오기',
  '설치 없이 웹에서 바로',
]

const STATS = [
  { big: 'URL 한 줄', rest: '붙여넣기만으로 저장 완료' },
  { big: '태그·카테고리 자동', rest: '편집도 언제든 직접 가능' },
  { big: '검색은 문장으로', rest: '키워드 안 외워도 됨' },
]

/**
 * 랜딩 페이지 — 전체 유저(비로그인/로그인) 접근 가능 (PUBLIC_PATHS)
 * 인증 상태에 따라 CTA 분기: 비로그인 → 로그인, 로그인 → 대시보드
 */
export default async function WelcomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const ctaHref = user ? '/' : '/login'
  const ctaLabel = user ? '대시보드로 이동' : '무료로 시작하기'

  return (
    <div className="relative min-h-screen overflow-hidden bg-surface">
      <header className="sticky top-0 z-50 border-b border-line bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <span className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-ink">
            <span className="gradient-brand h-2.5 w-2.5 rotate-45 rounded-[3px]" />
            Mowaba
          </span>
          <Link
            href={ctaHref}
            className="gradient-brand rounded-full px-5 py-2 text-sm font-bold text-white shadow-[0_10px_20px_-8px_rgba(45,111,209,.55)] transition-transform hover:-translate-y-px"
          >
            {user ? '대시보드로' : '시작하기'}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4">
        <section className="grid gap-12 py-16 md:grid-cols-[1.05fr_0.95fr] md:items-center md:py-24">
          <div>
            <div className="animate-rise mb-5 inline-flex items-center gap-2 rounded-full bg-mint-soft px-3.5 py-1.5 text-xs font-bold text-ink opacity-0">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink" />
              AI 자동 태깅 · pgvector 자연어 검색
            </div>

            <h1 className="animate-rise text-hero leading-tight font-extrabold tracking-tight text-ink opacity-0 [animation-delay:80ms]">
              저장은 1초,
              <br />
              정리는{' '}
              <span className="bg-gradient-to-r from-brand to-mint bg-clip-text text-transparent">
                AI
              </span>
              가 합니다
            </h1>

            <p className="animate-rise mt-5 max-w-md text-lg leading-relaxed text-text-secondary opacity-0 [animation-delay:160ms]">
              링크만 붙여넣으면 제목·태그·카테고리가 자동으로 채워집니다. 나중엔
              &ldquo;리액트 훅 정리&rdquo;처럼 문장으로 검색하세요.
            </p>

            <div className="animate-rise mt-8 flex flex-wrap items-center gap-3 opacity-0 [animation-delay:240ms]">
              <Link
                href={ctaHref}
                className="gradient-brand rounded-xl px-8 py-3 font-semibold text-white shadow-[0_10px_20px_-6px_rgba(74,144,226,.5)] transition-transform hover:-translate-y-px"
              >
                {ctaLabel}
              </Link>
              <a
                href="#features"
                className="rounded-xl border border-line bg-white px-6 py-3 font-semibold text-ink transition-colors hover:border-brand hover:text-brand-strong"
              >
                기능 살펴보기
              </a>
            </div>

            <ul className="animate-rise mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-text-secondary opacity-0 [animation-delay:320ms]">
              {TRUST_ITEMS.map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-mint" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* 히어로 비주얼 — 북마크 자동 태깅 카드 목업 (장식용, aria-hidden) */}
          <div
            className="animate-rise relative h-[380px] opacity-0 [animation-delay:280ms] md:h-[420px]"
            aria-hidden="true"
          >
            <div className="animate-drift absolute top-[8%] left-[6%] w-[88%] overflow-hidden rounded-2xl border border-line bg-white shadow-[0_30px_60px_-24px_rgba(45,62,80,.28)]">
              <div className="flex gap-1.5 border-b border-line px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-line" />
                <span className="h-2.5 w-2.5 rounded-full bg-line" />
                <span className="h-2.5 w-2.5 rounded-full bg-line" />
              </div>
              <div className="p-5">
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-text-secondary">
                  <Search className="h-3.5 w-3.5 flex-none text-brand" />
                  velog.io/@dev/react-hooks-deep-dive
                </div>
                <div className="mb-2.5 h-3 w-[78%] rounded-md bg-line" />
                <div className="mb-4 h-3 w-[45%] rounded-md bg-line" />
                <div className="flex flex-wrap gap-2">
                  <span className="animate-tag-in rounded-full bg-mint-soft px-3 py-1.5 text-xs font-bold text-ink opacity-0 [animation-delay:1.1s] [animation-fill-mode:forwards]">
                    #React
                  </span>
                  <span className="animate-tag-in rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-accent-foreground opacity-0 [animation-delay:1.3s] [animation-fill-mode:forwards]">
                    #프론트엔드
                  </span>
                  <span className="animate-tag-in rounded-full bg-warning/15 px-3 py-1.5 text-xs font-bold text-ink opacity-0 [animation-delay:1.5s] [animation-fill-mode:forwards]">
                    #추후정리
                  </span>
                </div>
              </div>
            </div>

            <div className="animate-drift absolute top-[2%] right-0 flex items-center gap-2.5 rounded-2xl border border-line bg-white px-3.5 py-3 text-sm font-bold text-ink shadow-[0_16px_32px_-12px_rgba(45,62,80,.22)] [animation-delay:.4s]">
              <span className="gradient-brand flex h-7 w-7 items-center justify-center rounded-lg text-white">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              AI가 자동 분류 완료
            </div>

            <div className="animate-drift absolute bottom-[6%] left-[-2%] flex items-center gap-2.5 rounded-2xl border border-line bg-white px-3.5 py-3 text-sm font-bold text-ink shadow-[0_16px_32px_-12px_rgba(45,62,80,.22)] [animation-delay:1s]">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-mint-soft text-ink">
                <Search className="h-3.5 w-3.5" />
              </span>
              자연어로 다시 찾기
            </div>
          </div>
        </section>

        <section
          aria-label="핵심 지표"
          className="grid grid-cols-1 divide-y divide-line border-y border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0"
        >
          {STATS.map((stat) => (
            <div key={stat.big} className="px-6 py-8 text-center sm:text-left">
              <p className="text-stat font-extrabold tracking-tight text-ink">
                {stat.big}
              </p>
              <p className="mt-1 text-sm font-semibold text-text-secondary">
                {stat.rest}
              </p>
            </div>
          ))}
        </section>

        <section aria-labelledby="features-heading" id="features" className="py-20">
          <div className="mx-auto mb-10 max-w-xl text-center sm:text-left">
            <p className="mb-3 text-xs font-extrabold tracking-wider text-brand-strong uppercase">
              Core Features
            </p>
            <h2
              id="features-heading"
              className="mb-3 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl"
            >
              정리 대신 저장에만 집중하세요
            </h2>
            <p className="text-text-secondary">
              Mowaba가 태그·카테고리 분류를 맡고, 필요할 땐 문장으로 다시
              찾아드립니다.
            </p>
          </div>

          <ServiceFeatures />
        </section>

        <section className="pb-20">
          <div className="gradient-brand relative overflow-hidden rounded-[2rem] px-8 py-16 text-center sm:px-16">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(420px_300px_at_12%_0%,rgba(72,201,176,.35),transparent_60%),radial-gradient(500px_380px_at_92%_100%,rgba(255,255,255,.14),transparent_60%)]"
              aria-hidden="true"
            />
            <h2 className="relative mb-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              지금 저장한 링크, 나중에 다시 찾을 수 있나요?
            </h2>
            <p className="relative mb-8 text-white/85">
              Mowaba로 시작하면 정리는 AI에게 맡기고 나만의 검색으로 바로 찾을
              수 있습니다.
            </p>
            <Link
              href={ctaHref}
              className="relative inline-block rounded-xl bg-white px-8 py-3 font-bold text-brand-strong shadow-[0_14px_30px_-10px_rgba(0,0,0,.35)] transition-transform hover:-translate-y-px"
            >
              {ctaLabel}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-9">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 text-sm text-text-secondary">
          <span className="flex items-center gap-2 font-extrabold text-ink">
            <span className="gradient-brand h-2 w-2 rotate-45 rounded-[2px]" />
            Mowaba
          </span>
          <span>© 2026 Mowaba. AI 북마크 관리 서비스.</span>
        </div>
      </footer>
    </div>
  )
}
