import { describe, it, expect } from 'vitest'
import { formatKakaoChatCsv } from '../formatKakaoChatCsv'
import { parseKakaoChat } from '../parseKakaoChat'

describe('formatKakaoChatCsv', () => {
  it('Date,User,Message 헤더 + BOM으로 시작', () => {
    const csv = formatKakaoChatCsv([])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('Date,User,Message')
  })

  it('created_at을 실제 카톡 내보내기와 동일한 날짜 표기로 변환', () => {
    const csv = formatKakaoChatCsv([
      { title: '예시', url: 'https://example.com', created_at: '2023-09-15T03:39:04.000Z' },
    ])
    expect(csv).toContain('2023-09-15 03:39:04,"예시","https://example.com"')
  })

  it('제목에 큰따옴표 포함 시 이스케이프(RFC4180)', () => {
    const csv = formatKakaoChatCsv([
      { title: '"인용" 제목', url: 'https://example.com', created_at: '2023-09-15T03:39:04.000Z' },
    ])
    expect(csv).toContain('"""인용"" 제목"')
  })

  it('parseKakaoChat으로 재파싱하면 url 왕복 복원', () => {
    const csv = formatKakaoChatCsv([
      { title: 'Next.js', url: 'https://nextjs.org', created_at: '2023-09-15T03:39:04.000Z' },
      { title: '리액트', url: 'https://react.dev', created_at: '2023-09-16T10:00:00.000Z' },
    ])
    const parsed = parseKakaoChat(csv)
    expect(parsed.map((p) => p.url)).toEqual(['https://nextjs.org', 'https://react.dev'])
  })
})
