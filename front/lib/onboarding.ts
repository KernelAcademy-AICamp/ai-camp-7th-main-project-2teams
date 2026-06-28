// 온보딩 완료 상태 공유 유틸 — 페이지 디렉토리 의존 제거(대시보드·온보딩 공용)

// 유저별 localStorage 키 — 동일 브라우저 다중 계정 충돌 방지
export function getOnboardingKey(userId: string): string {
  return `onboarding_done_${userId}`
}

// localStorage 원시값 → 완료 여부.
// usehooks-ts useLocalStorage가 JSON 직렬화("true"/"false")하므로 JSON.parse로 해석.
// 손상된 값(수동 편집·확장 간섭)에도 크래시 없이 false 폴백.
export function isOnboardingDone(stored: string | null): boolean {
  if (stored === null) return false
  try {
    return JSON.parse(stored) === true
  } catch {
    return false
  }
}
