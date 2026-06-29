import { defineConfig, devices } from '@playwright/test'

// 일반 dev(3000)와 충돌 회피용 전용 포트
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100'

/**
 * 공개 페이지 e2e — PR 게이트 (CI ci.yml).
 * 인증 플로우는 미포함(수동 docs/specs/e2e/*.md). 비로그인 getUser()는 null 반환 → 공개 페이지 정상 렌더.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // 외부 BASE_URL 지정 시(배포 프리뷰 등) 서버 기동 생략
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev -- -p 3100',
        url: 'http://localhost:3100',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
