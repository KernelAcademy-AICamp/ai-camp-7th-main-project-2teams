import { build } from 'esbuild'
import { readFileSync } from 'node:fs'

// .env(gitignore 대상) 로드 — 이미 export된 실제 환경변수는 덮어쓰지 않음(CI 우선)
try {
  for (const line of readFileSync(new URL('.env', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) process.env[m[1]] ??= m[2]
  }
} catch {
  // .env 없음 — CI/실빌드는 실제 환경변수로 주입하므로 무시
}

// 환경변수를 번들에 리터럴로 주입. 미설정 키는 빈 문자열 → config.js의 || fallback 적용.
const define = {
  'process.env.SUPABASE_URL': JSON.stringify(process.env.SUPABASE_URL ?? ''),
  'process.env.SUPABASE_ANON_KEY': JSON.stringify(process.env.SUPABASE_ANON_KEY ?? ''),
  'process.env.WEB_APP_URL': JSON.stringify(process.env.WEB_APP_URL ?? ''),
}

const shared = { bundle: true, minify: false, target: 'chrome120', define }

await Promise.all([
  build({ ...shared, format: 'esm', entryPoints: ['background/index.js'], outfile: 'dist/background.js' }),
  build({ ...shared, format: 'iife', entryPoints: ['content/index.js'],    outfile: 'dist/content.js' }),
  build({ ...shared, format: 'esm', entryPoints: ['popup/popup.js'],       outfile: 'dist/popup.js' }),
])

console.log('build done → dist/')
