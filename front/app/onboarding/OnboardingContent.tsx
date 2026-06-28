'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLocalStorage } from 'usehooks-ts'
import { getOnboardingKey, createCompleteHandler, shouldRedirectHome } from './onboardingUtils'

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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* 헤더 — 대시보드 레이아웃과 동일한 톤 */}
      <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex h-14 max-w-4xl items-center px-4">
          <span className="text-lg font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
            Bookmarker
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12">
        {/* 상단 인사 */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            환영합니다!
          </h1>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            북마크를 저장하면 AI가 자동으로 정리해 드립니다.
          </p>
        </div>

        {/* 3개 안내 섹션 */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* 섹션 1: 익스텐션 설치 안내 */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400">
              <span className="text-lg font-bold">1</span>
            </div>
            <h2 className="mb-2 font-semibold text-gray-900 dark:text-gray-100">
              Chrome 익스텐션 설치
            </h2>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              어느 페이지에서든 클릭 한 번으로 북마크를 저장하세요.
            </p>
            {/* Chrome 웹스토어 미게시 — placeholder href */}
            <a
              href="#"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              설치하기 (준비 중)
            </a>
          </div>

          {/* 섹션 2: 첫 북마크 저장 방법 */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400">
              <span className="text-lg font-bold">2</span>
            </div>
            <h2 className="mb-2 font-semibold text-gray-900 dark:text-gray-100">
              북마크 저장하기
            </h2>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              <kbd className="rounded border border-gray-300 px-1.5 py-0.5 font-mono text-xs dark:border-gray-600">
                Cmd+Shift+S
              </kbd>{' '}
              또는 익스텐션 버튼을 클릭하면 저장과 동시에 AI가 태그를 붙여줍니다.
            </p>
            {/* 데모 GIF 자리 — 실제 바이너리 에셋 커밋 금지, placeholder div */}
            <div className="flex h-24 items-center justify-center rounded-md bg-gray-100 text-sm text-gray-400 dark:bg-gray-800">
              데모 GIF 영역
            </div>
          </div>

          {/* 섹션 3: 자연어 검색 소개 */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400">
              <span className="text-lg font-bold">3</span>
            </div>
            <h2 className="mb-2 font-semibold text-gray-900 dark:text-gray-100">
              자연어로 검색
            </h2>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              &ldquo;리액트 훅 정리&rdquo;, &ldquo;디자인 참고 사이트&rdquo;처럼 검색하면
              AI가 관련 북마크를 찾아줍니다.
            </p>
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-800">
              리액트 훅 정리...
            </div>
          </div>
        </div>

        {/* CTA 버튼 영역 */}
        <div className="mt-10 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={handleComplete}
            className="rounded-md bg-indigo-600 px-8 py-3 font-medium text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            시작하기
          </button>
          <button
            type="button"
            onClick={handleComplete}
            className="text-sm text-gray-400 underline-offset-2 hover:underline dark:text-gray-500"
          >
            건너뛰기
          </button>
        </div>
      </main>
    </div>
  )
}
