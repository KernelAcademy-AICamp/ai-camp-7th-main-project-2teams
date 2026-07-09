import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OnboardingContent } from './OnboardingContent'

export const metadata = {
  title: '시작하기 | Mowaba',
}

/**
 * 온보딩 페이지 — MVP 단일 페이지 (v1.1 Modal Wizard 아님, docs/specs/onboarding-modal.md 참고)
 * 서버 컴포넌트에서 userId 획득 후 클라이언트 컴포넌트에 전달
 */
export default async function OnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 미들웨어가 1차 보호하지만, 서버에서 이중 확인
  if (!user) {
    redirect('/login')
  }

  return <OnboardingContent userId={user.id} />
}
