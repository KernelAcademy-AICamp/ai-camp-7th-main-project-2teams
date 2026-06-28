/**
 * 온보딩 순수 유틸 테스트 (docs/specs/testing.md AAA 패턴)
 * UI 컴포넌트 렌더 테스트는 MVP 스킵 (testing.md §6 — @testing-library/react v1.1)
 * 핵심 로직(키 생성·완료 핸들러·리다이렉트 조건)만 vitest node 환경에서 검증
 */
import { describe, it, expect, vi } from 'vitest'
import {
  getOnboardingKey,
  createCompleteHandler,
  shouldRedirectHome,
} from '../onboardingUtils'

// ── getOnboardingKey ────────────────────────────────────────────────────────

describe('getOnboardingKey — localStorage 키 생성', () => {
  it('userId로 올바른 키를 생성한다', () => {
    // Arrange
    const userId = 'user-abc-123'
    // Act
    const key = getOnboardingKey(userId)
    // Assert
    expect(key).toBe('onboarding_done_user-abc-123')
  })

  it('다른 userId는 다른 키를 생성해 계정 간 상태 충돌을 방지한다', () => {
    // Arrange
    const key1 = getOnboardingKey('user-1')
    const key2 = getOnboardingKey('user-2')
    // Assert
    expect(key1).not.toBe(key2)
  })

  it('UUID 형식 userId도 키에 그대로 포함된다', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000'
    expect(getOnboardingKey(uuid)).toBe(`onboarding_done_${uuid}`)
  })
})

// ── shouldRedirectHome ──────────────────────────────────────────────────────

describe('shouldRedirectHome — 리다이렉트 조건 판단', () => {
  it('done=false이면 온보딩 콘텐츠를 표시한다 (리다이렉트 없음)', () => {
    // Arrange & Act
    const result = shouldRedirectHome(false)
    // Assert — false: 온보딩 렌더, true: 홈 리다이렉트
    expect(result).toBe(false)
  })

  it('done=true이면 홈으로 리다이렉트한다', () => {
    expect(shouldRedirectHome(true)).toBe(true)
  })
})

// ── createCompleteHandler ───────────────────────────────────────────────────

describe('createCompleteHandler — 시작하기/건너뛰기 완료 핸들러', () => {
  it('호출 시 setDone(true)과 push("/")를 실행한다', () => {
    // Arrange
    const setDone = vi.fn()
    const push = vi.fn()
    // Act
    const handle = createCompleteHandler(setDone, push)
    handle()
    // Assert
    expect(setDone).toHaveBeenCalledOnce()
    expect(setDone).toHaveBeenCalledWith(true)
    expect(push).toHaveBeenCalledOnce()
    expect(push).toHaveBeenCalledWith('/')
  })

  it('setDone이 push보다 먼저 호출된다 (상태 저장 후 이동)', () => {
    // Arrange — 호출 순서 추적
    const callOrder: string[] = []
    const setDone = vi.fn(() => { callOrder.push('setDone') })
    const push = vi.fn(() => { callOrder.push('push') })
    // Act
    createCompleteHandler(setDone, push)()
    // Assert
    expect(callOrder).toEqual(['setDone', 'push'])
  })

  it('여러 번 호출 시 매번 setDone(true)과 push("/")를 실행한다', () => {
    // Arrange
    const setDone = vi.fn()
    const push = vi.fn()
    const handle = createCompleteHandler(setDone, push)
    // Act
    handle()
    handle()
    // Assert
    expect(setDone).toHaveBeenCalledTimes(2)
    expect(push).toHaveBeenCalledTimes(2)
  })
})
