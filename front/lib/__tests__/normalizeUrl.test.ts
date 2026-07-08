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

  it('http/https 차이는 동일 URL로 정규화', () => {
    expect(normalizeUrl('http://ex.com/page')).toBe('https://ex.com/page')
  })

  it('www 유무 차이는 동일 URL로 정규화', () => {
    expect(normalizeUrl('https://www.ex.com/page')).toBe('https://ex.com/page')
    expect(normalizeUrl('http://www.ex.com/page')).toBe('https://ex.com/page')
  })

  it('유튜브 공유 트래킹 파라미터(si) 제거', () => {
    expect(normalizeUrl('https://youtu.be/abc123?si=TqO5GL_F83SCGnCI')).toBe(
      'https://youtu.be/abc123',
    )
    expect(normalizeUrl('https://youtube.com/watch?v=abc&si=xyz')).toBe(
      'https://youtube.com/watch?v=abc',
    )
  })

  it('youtu.be와 youtube.com/watch?v=는 같은 영상이면 동일 canonical로 dedup', () => {
    const canonical = 'https://youtube.com/watch?v=dQw4w9WgXcQ'
    expect(normalizeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(canonical)
    expect(normalizeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s')).toBe(canonical)
    expect(normalizeUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(canonical)
  })
})
