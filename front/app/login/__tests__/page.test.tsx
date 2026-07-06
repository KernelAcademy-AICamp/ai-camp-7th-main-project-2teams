// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const signInWithOAuth = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithOAuth } }),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element -- 테스트용 목, 실제 렌더 최적화 대상 아님
  default: (props: { alt: string }) => <img alt={props.alt} />,
}))

import LoginPage from '../page'

describe('LoginPage', () => {
  beforeEach(() => {
    signInWithOAuth.mockReset()
  })

  it('Google·카카오 로그인 버튼이 모두 렌더된다', () => {
    render(<LoginPage />)

    expect(screen.getByRole('button', { name: 'Google로 계속하기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '카카오로 계속하기' })).toBeInTheDocument()
  })

  it('카카오 버튼 클릭 시 provider kakao로 signInWithOAuth 호출 (A63)', () => {
    render(<LoginPage />)

    fireEvent.click(screen.getByRole('button', { name: '카카오로 계속하기' }))

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'kakao',
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
  })

  it('Google 버튼 클릭 시 provider google로 signInWithOAuth 호출 (기존 동작 회귀 방지)', () => {
    render(<LoginPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Google로 계속하기' }))

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
  })
})
