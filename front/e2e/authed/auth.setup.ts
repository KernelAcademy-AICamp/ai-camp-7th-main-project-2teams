import { test as setup } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { mkdirSync, writeFileSync } from 'node:fs'

/**
 * 테스트 Supabase에 세션을 발급해 Playwright storageState로 저장.
 * 앱은 Google OAuth 전용이나, 세션 쿠키는 발급 경로와 무관하게 서버 getUser가 검증 →
 * 서비스롤로 만든 테스트 유저(email+password)로 세션을 만들어 주입한다.
 *
 * 필요 env(테스트 전용 Supabase 프로젝트 권장 — 운영/개발 DB 오염 금지):
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *   E2E_TEST_EMAIL, E2E_TEST_PASSWORD (선택, 기본값 있음)
 */

const STATE_PATH = 'e2e/.auth/state.json'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
// ||(??아님) — 워크플로가 미설정 시크릿을 빈 문자열로 전달하므로 빈 값도 기본값 폴백
const EMAIL = process.env.E2E_TEST_EMAIL || 'e2e-bot@example.com'
const PASSWORD = process.env.E2E_TEST_PASSWORD || 'e2e-bot-password-1234!'

setup('테스트 유저 세션 주입', async () => {
  const admin = createClient(URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 테스트 유저 보장(멱등) — 이미 있으면 비번 갱신, 없으면 생성
  const { data: list } = await admin.auth.admin.listUsers()
  let userId = list.users.find((u) => u.email === EMAIL)?.id
  if (userId) {
    await admin.auth.admin.updateUserById(userId, { password: PASSWORD, email_confirm: true })
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    })
    if (error) throw error
    userId = data.user.id
  }

  // 직전 실행 잔여 데이터 정리(결정성 — 임포트/검색 결과 누적 방지)
  await admin.from('bookmarks').delete().eq('user_id', userId)

  // 비번 로그인 → 세션 토큰 확보
  const anon = createClient(URL, ANON, { auth: { persistSession: false } })
  const { data: signin, error: signinErr } = await anon.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  })
  if (signinErr || !signin.session) throw signinErr ?? new Error('세션 발급 실패')

  // @supabase/ssr에 setSession → setAll 콜백으로 실제 쿠키 형식 수확(수동 직렬화 회피)
  const captured: { name: string; value: string }[] = []
  const ssr = createServerClient(URL, ANON, {
    cookies: {
      getAll: () => [],
      setAll: (cookiesToSet) =>
        cookiesToSet.forEach(({ name, value }) => captured.push({ name, value })),
    },
  })
  await ssr.auth.setSession({
    access_token: signin.session.access_token,
    refresh_token: signin.session.refresh_token,
  })

  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3100'
  const host = new global.URL(baseUrl).hostname
  const cookies = captured.map((c) => ({
    name: c.name,
    value: c.value,
    domain: host,
    path: '/',
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: 'Lax' as const,
  }))

  // 온보딩 자동 리다이렉트(대시보드 page.tsx) 우회 — 완료 표시 주입
  const origins = [
    {
      origin: baseUrl,
      localStorage: [{ name: `onboarding_done_${userId}`, value: 'true' }],
    },
  ]

  mkdirSync('e2e/.auth', { recursive: true })
  writeFileSync(STATE_PATH, JSON.stringify({ cookies, origins }))
})
