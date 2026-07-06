import { describe, it, expect } from 'vitest'
import { getErrorMessageClassName } from '../AddBookmarkModal'

// --- (A59) 중복 북마크 에러 vs 일반 에러 스타일 분기 ---
describe('getErrorMessageClassName', () => {
  it('duplicate 에러 → 안내(앰버) 톤 클래스', () => {
    const err = Object.assign(new Error('이미 저장된 북마크입니다.'), { duplicate: true })
    expect(getErrorMessageClassName(err)).toBe('text-amber-600 dark:text-amber-400')
  })

  it('일반 에러 → destructive(빨강) 클래스', () => {
    const err = new Error('저장 실패')
    expect(getErrorMessageClassName(err)).toBe('text-destructive')
  })

  it('duplicate: false 명시된 에러 → destructive 클래스', () => {
    const err = Object.assign(new Error('저장 실패'), { duplicate: false })
    expect(getErrorMessageClassName(err)).toBe('text-destructive')
  })

  it('null/undefined 에러 → destructive 클래스로 안전 폴백', () => {
    expect(getErrorMessageClassName(null)).toBe('text-destructive')
    expect(getErrorMessageClassName(undefined)).toBe('text-destructive')
  })
})
