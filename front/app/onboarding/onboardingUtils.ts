/**
 * 온보딩 상태 관련 순수 유틸리티
 * 테스트 대상: 외부 의존 없는 순수 함수만 포함
 */

// 공유 키 유틸 재노출 — 대시보드는 @/lib/onboarding 직접 사용
export { getOnboardingKey } from '@/lib/onboarding'

/**
 * 온보딩 완료 핸들러 팩토리
 * setDone → navigate 순서 보장 (상태 저장 후 이동).
 * navigate는 router.replace를 받아 히스토리에 /onboarding이 남지 않게 함(뒤로가기 루프 방지).
 */
export function createCompleteHandler(
  setDone: (value: boolean) => void,
  navigate: (path: string) => void
): () => void {
  return () => {
    setDone(true)
    navigate('/')
  }
}

/**
 * 홈 리다이렉트 필요 여부 판단
 * done=true → 이미 온보딩 완료 → 홈으로 보내야 함
 */
export function shouldRedirectHome(done: boolean): boolean {
  return done
}
