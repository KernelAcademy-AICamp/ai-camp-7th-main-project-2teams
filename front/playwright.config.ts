import { defineConfig, devices } from '@playwright/test'

// 일반 dev(3000)와 충돌 회피용 전용 포트
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100'

/**
 * e2e 2계층:
 * - public  : 인증 불필요 공개 페이지. PR 게이트(ci.yml). `--project=public`
 * - authed  : 세션 주입 후 인증 플로우. nightly 워크플로(e2e-authed.yml). `--project=authed`
 *             setup 프로젝트가 테스트 Supabase 세션을 e2e/.auth/state.json에 저장 후 authed가 재사용.
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
  projects: [
    {
      name: 'public',
      testDir: './e2e/public',
      use: { ...devices['Desktop Chrome'] },
    },
    // 세션 주입 — authed의 선행 의존
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts$/,
    },
    {
      name: 'authed',
      testDir: './e2e/authed',
      testIgnore: /auth\.setup\.ts$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/state.json' },
    },
  ],
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
