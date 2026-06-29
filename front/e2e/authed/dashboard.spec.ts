import { test, expect } from '@playwright/test'

/**
 * 인증 상태 대시보드 접근 — 세션 주입(auth.setup) + 온보딩 우회가 동작하는지 검증.
 * 이 스펙이 통과하면 세션 주입 하네스 전체가 유효함을 의미.
 */
test('세션 있으면 / 접근 시 로그인 리다이렉트 없이 대시보드 노출', async ({ page }) => {
  await page.goto('/')
  // /login·/onboarding으로 튕기지 않고 루트 유지
  await expect(page).toHaveURL(/\/$/)
  // 헤더 가이드 버튼 + 검색 영역 노출
  await expect(page.getByRole('button', { name: '사용법' })).toBeVisible()
  await expect(page.getByRole('search', { name: '북마크 검색 영역' })).toBeVisible()
})
