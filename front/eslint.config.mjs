import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

// Next.js 16: `next lint` 제거 → eslint-config-next가 flat config 직접 export
const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**'],
  },
]

export default eslintConfig
