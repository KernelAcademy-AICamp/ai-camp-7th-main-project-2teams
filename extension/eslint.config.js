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
    ignores: ['coverage/**', 'dist/**'],
  },
]
