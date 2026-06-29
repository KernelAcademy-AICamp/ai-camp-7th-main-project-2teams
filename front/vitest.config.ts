import { defineConfig, configDefaults } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    // API Route Handler는 node 환경, 컴포넌트는 jsdom (v1.1)
    environment: 'node',
    globals: true,
    // e2e/는 Playwright 전용 — vitest 기본 글롭(.spec)에서 제외
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
