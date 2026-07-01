import { describe, it, expect } from 'vitest'
import { normalizeUrl } from '../normalizeUrl'

describe('normalizeUrl', () => {
  it('말미 slash 제거 (루트 경로는 유지)', () => {
    expect(normalizeUrl('https://ex.com/page/')).toBe('https://ex.com/page')
    expect(normalizeUrl('https://ex.com/')).toBe('https://ex.com/')
  })

  it('fragment 제거', () => {
    expect(normalizeUrl('https://ex.com/page#section')).toBe('https://ex.com/page')
  })

  it('트래킹 파라미터 제거 (utm_*, gclid, fbclid 등)', () => {
    expect(normalizeUrl('https://ex.com/p?utm_source=x&utm_medium=y')).toBe('https://ex.com/p')
    expect(normalizeUrl('https://ex.com/p?gclid=abc&fbclid=def')).toBe('https://ex.com/p')
  })

  it('의미있는 쿼리는 보존', () => {
    expect(normalizeUrl('https://youtube.com/watch?v=abc')).toBe('https://youtube.com/watch?v=abc')
  })

  it('트래킹만 섞인 경우 의미쿼리만 남김', () => {
    expect(normalizeUrl('https://youtube.com/watch?v=abc&utm_source=x')).toBe(
      'https://youtube.com/watch?v=abc',
    )
  })

  it('host 소문자화', () => {
    expect(normalizeUrl('https://YouTube.com/watch?v=abc')).toBe('https://youtube.com/watch?v=abc')
  })

  it('남은 쿼리 파라미터 정렬 (순서 무관 동일 URL 처리)', () => {
    expect(normalizeUrl('https://ex.com/p?b=2&a=1')).toBe('https://ex.com/p?a=1&b=2')
  })

  it('복합 케이스 — 전부 적용', () => {
    expect(normalizeUrl('https://YouTube.com/watch?v=abc&utm_source=x#top')).toBe(
      'https://youtube.com/watch?v=abc',
    )
  })

  it('파싱 불가 입력은 원문 반환 (schema가 이미 검증하지만 방어)', () => {
    expect(normalizeUrl('not a url')).toBe('not a url')
  })
})
