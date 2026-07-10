'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLocalStorage } from 'usehooks-ts'
import { getOnboardingKey, createCompleteHandler, shouldRedirectHome } from './onboardingUtils'
import { ServiceFeatures } from '@/components/ServiceFeatures'

interface OnboardingContentProps {
  userId: string
}

export function OnboardingContent({ userId }: OnboardingContentProps) {
  const router = useRouter()
  // CLAUDE.md 규칙: usehooks-ts의 useLocalStorage 필수 사용
  const [done, setDone] = useLocalStorage(getOnboardingKey(userId), false)

  // 이미 완료된 유저가 /onboarding에 직접 접근하면 홈으로 리다이렉트
  // replace로 히스토리에 /onboarding 미잔류 → 뒤로가기 루프 방지
  useEffect(() => {
    if (shouldRedirectHome(done)) {
      router.replace('/')
    }
  }, [done, router])

  const handleComplete = createCompleteHandler(setDone, (path) => router.replace(path))

  // 완료 상태이면 아무것도 렌더하지 않음 (useEffect가 리다이렉트 처리)
  if (done) return null

  return (
    <div className="min-h-screen bg-surface">
      {/* 헤더 — 대시보드 레이아웃과 동일한 톤 */}
      <header className="border-b border-line bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-4xl items-center px-4">
          <span className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-ink">
            <span className="gradient-brand h-2.5 w-2.5 rotate-45 rounded-[3px]" />
            Mowaba
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12">
        {/* 상단 인사 — 순차 리빌 1단계 */}
        <div className="animate-rise mb-10 text-center opacity-0">
          <h1 className="text-heading font-extrabold tracking-tight text-ink">
            환영합니다!
          </h1>
          <p className="mt-2 text-text-secondary">
            북마크를 저장하면 AI가 자동으로 정리해 드립니다.
          </p>
          {/* 설치 없이 웹에서 바로 쓸 수 있다는 걸 아래 ServiceFeatures 탭(웹이 기본값)보다 먼저 알림 —
              여기 없으면 "익스텐션부터 깔아야 하나" 오해 소지 */}
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-mint-soft px-3 py-1 text-xs font-bold text-ink">
            설치 없이 웹에서 바로 시작 · 익스텐션은 선택
          </span>
        </div>

        {/* 3개 안내 섹션 — 공용 컴포넌트. 카드 자체는 ServiceFeatures 내부에서 순차 리빌 */}
        <div className="animate-rise opacity-0 [animation-delay:120ms]">
          <ServiceFeatures />
        </div>

        {/* CTA 버튼 영역 — 안내를 다 읽을 시점에 맞춰 마지막으로 등장 */}
        <div className="animate-rise mt-10 flex flex-col items-center gap-3 opacity-0 [animation-delay:520ms]">
          <button
            type="button"
            onClick={handleComplete}
            className="gradient-brand cursor-pointer rounded-xl px-8 py-3 font-semibold text-white shadow-[0_10px_20px_-6px_rgba(74,144,226,.5)] transition-transform hover:-translate-y-px"
          >
            시작하기
          </button>
          <button
            type="button"
            onClick={handleComplete}
            className="cursor-pointer text-sm text-text-secondary underline-offset-2 hover:underline"
          >
            건너뛰기
          </button>
        </div>
      </main>
    </div>
  )
}
