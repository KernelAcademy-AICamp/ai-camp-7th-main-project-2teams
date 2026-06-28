import js from '@eslint/js'
import globals from 'globals'

export default [
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    // 빌드 스크립트 + 빌드 타임 치환되는 config는 node 환경(process 등)
    files: ['build.js', 'lib/config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    ignores: ['coverage/**', 'dist/**'],
  },
]
