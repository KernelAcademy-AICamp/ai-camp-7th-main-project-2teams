import { test, expect } from '@playwright/test'

/**
 * 공개 페이지 + 비로그인 접근 제어 e2e (PR 게이트).
 * 인증 불필요 — 비로그인 상태(getUser=null) 기준 동작 검증.
 */

test.describe('공개 페이지', () => {
  test('/welcome — 랜딩, 비로그인 시 로그인 CTA 노출', async ({ page }) => {
    await page.goto('/welcome')
    await expect(
      page.getByRole('heading', { name: '저장한 북마크를 AI가 자동으로 정리합니다' })
    ).toBeVisible()
    // 비로그인 분기 — "Google로 시작하기" → /login
    const cta = page.getByRole('link', { name: 'Google로 시작하기' })
    await expect(cta).toBeVisible()
    await expect(cta).toHaveAttribute('href', '/login')
  })

  test('/login — Google 로그인 버튼 + 서비스 소개 링크', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: '북마크 AI' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Google로 계속하기' })).toBeVisible()
    await expect(page.getByRole('link', { name: '서비스 소개 보기' })).toHaveAttribute(
      'href',
      '/welcome'
    )
  })

  test('/privacy — 개인정보처리방침 노출', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page.getByRole('heading', { name: '개인정보처리방침' })).toBeVisible()
  })

  test('/terms — 이용약관 노출', async ({ page }) => {
    await page.goto('/terms')
    await expect(page.getByRole('heading', { name: '이용약관' })).toBeVisible()
  })
})

test.describe('비로그인 접근 제어', () => {
  test('보호 경로(/) 접근 시 /welcome으로 리다이렉트', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/welcome$/)
  })

  test('보호 경로(/settings) 접근 시 /welcome으로 리다이렉트', async ({ page }) => {
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/welcome$/)
  })
})
