import { build } from 'esbuild'

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
