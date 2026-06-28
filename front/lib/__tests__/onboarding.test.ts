import { describe, it, expect } from 'vitest'
import { getOnboardingKey, isOnboardingDone } from '../onboarding'

describe('getOnboardingKey', () => {
  it('userId를 키에 포함한다', () => {
    expect(getOnboardingKey('u1')).toBe('onboarding_done_u1')
  })
})

describe('isOnboardingDone — localStorage 값 안전 해석', () => {
  it('"true" → true', () => {
    expect(isOnboardingDone('true')).toBe(true)
  })

  it('"false" → false', () => {
    expect(isOnboardingDone('false')).toBe(false)
  })

  it('null(미설정) → false', () => {
    expect(isOnboardingDone(null)).toBe(false)
  })

  it('손상된 JSON → 크래시 없이 false 폴백', () => {
    expect(isOnboardingDone('{not-json')).toBe(false)
    expect(isOnboardingDone('undefined')).toBe(false)
  })
})
