import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    // API Route Handler는 node 환경, 컴포넌트는 jsdom (v1.1)
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
