import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    // API Route Handler는 node 환경, 컴포넌트는 jsdom (v1.1, 파일별 // @vitest-environment jsdom로 오버라이드)
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
