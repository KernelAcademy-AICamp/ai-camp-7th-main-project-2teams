import { describe, it, expect } from 'vitest'
import { isPublicPath } from '../middleware'

describe('isPublicPath — 공개 경로 판별', () => {
  it('/login은 공개 경로다', () => {
    expect(isPublicPath('/login')).toBe(true)
  })

  it('/auth/callback은 공개 경로다', () => {
    expect(isPublicPath('/auth/callback')).toBe(true)
  })

  it('/privacy는 공개 경로다', () => {
    expect(isPublicPath('/privacy')).toBe(true)
  })

  it('/terms는 공개 경로다', () => {
    expect(isPublicPath('/terms')).toBe(true)
  })

  it('/goodbye는 공개 경로다', () => {
    expect(isPublicPath('/goodbye')).toBe(true)
  })

  it('루트 경로(/)는 보호 경로다 — 미인증 시 /login redirect 대상', () => {
    expect(isPublicPath('/')).toBe(false)
  })

  it('/dashboard는 보호 경로다', () => {
    expect(isPublicPath('/dashboard')).toBe(false)
  })

  it('/api/bookmarks는 보호 경로다', () => {
    expect(isPublicPath('/api/bookmarks')).toBe(false)
  })

  it('/settings는 보호 경로다', () => {
    expect(isPublicPath('/settings')).toBe(false)
  })
})
