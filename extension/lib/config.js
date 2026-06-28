// Supabase 공개 키 + 웹앱 URL.
// 빌드 타임에 esbuild define이 process.env.* 를 리터럴로 치환(build.js).
// 환경변수 미설정 시 아래 fallback 사용(로컬 개발). prod 빌드는 env로 주입.
export const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://your-project.supabase.co'
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'your-anon-key'
export const WEB_APP_URL = process.env.WEB_APP_URL || 'http://localhost:3000'
