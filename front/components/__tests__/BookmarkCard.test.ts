import { describe, it, expect } from 'vitest'
import { getFavoriteAriaLabel, getFavoriteIconClass, safeUrl } from '../BookmarkCard'

// --- (5) BookmarkCard is_favorite 상태별 aria/아이콘 ---
describe('BookmarkCard helpers', () => {
  describe('getFavoriteAriaLabel', () => {
    it('즐겨찾기 상태(true) → "즐겨찾기 해제" 레이블', () => {
      expect(getFavoriteAriaLabel(true)).toBe('즐겨찾기 해제')
    })

    it('비즐겨찾기 상태(false) → "즐겨찾기 추가" 레이블', () => {
      expect(getFavoriteAriaLabel(false)).toBe('즐겨찾기 추가')
    })
  })

  describe('getFavoriteIconClass', () => {
    it('즐겨찾기(true) → fill-yellow-400 클래스 포함 (채움 아이콘)', () => {
      expect(getFavoriteIconClass(true)).toContain('fill-yellow-400')
    })

    it('즐겨찾기(true) → text-yellow-400 클래스 포함', () => {
      expect(getFavoriteIconClass(true)).toContain('text-yellow-400')
    })

    it('비즐겨찾기(false) → fill 클래스 미포함 (빈 아이콘)', () => {
      expect(getFavoriteIconClass(false)).not.toContain('fill-yellow-400')
    })

    it('is_favorite 상태 따라 다른 클래스 반환', () => {
      expect(getFavoriteIconClass(true)).not.toBe(getFavoriteIconClass(false))
    })
  })

  describe('safeUrl (XSS 방어)', () => {
    it('https URL은 그대로 반환', () => {
      expect(safeUrl('https://example.com')).toBe('https://example.com')
    })

    it('http URL은 그대로 반환', () => {
      expect(safeUrl('http://example.com')).toBe('http://example.com')
    })

    it('javascript: URL → # 반환 (XSS 방어)', () => {
      expect(safeUrl('javascript:alert(1)')).toBe('#')
    })

    it('잘못된 URL → # 반환', () => {
      expect(safeUrl('not-a-url')).toBe('#')
    })
  })
})
