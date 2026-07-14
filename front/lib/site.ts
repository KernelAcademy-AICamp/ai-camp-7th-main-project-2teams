// 프로덕션 도메인 미설정 시 Vercel이 자동 주입하는 프로덕션 URL로 폴백
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
  ? process.env.NEXT_PUBLIC_SITE_URL
  : `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? 'localhost:3000'}`
