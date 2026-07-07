'use client'

import { useRef } from 'react'
import { ServiceFeatures } from '@/components/ServiceFeatures'

/**
 * 사용법 재확인 가이드 — 대시보드 헤더 버튼 (A26 v1.1 "다시 보기" 트리거)
 * 네이티브 <dialog>로 모달 구현 — 라이브러리 추가 없음(onboarding-modal.md 설계 가치), ESC 닫힘 기본 제공
 */
export function OnboardingGuideButton() {
  const dialogRef = useRef<HTMLDialogElement>(null)

  // 배경(backdrop) 클릭 시 닫힘 — <dialog> 자체 영역 밖 클릭 감지
  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      dialogRef.current?.close()
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="cursor-pointer text-sm font-medium text-white/85 transition-colors hover:text-white"
      >
        사용법
      </button>

      <dialog
        ref={dialogRef}
        onClick={handleBackdropClick}
        className="m-auto w-[min(56rem,90vw)] rounded-xl bg-transparent p-0 backdrop:bg-black/40"
      >
        <div className="rounded-xl bg-white p-6 dark:bg-gray-900">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              사용법 안내
            </h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="닫기"
              className="cursor-pointer text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              ✕
            </button>
          </div>
          <ServiceFeatures />
        </div>
      </dialog>
    </>
  )
}
