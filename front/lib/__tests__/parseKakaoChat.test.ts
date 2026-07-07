import { describe, it, expect } from 'vitest'
import { parseKakaoChat } from '../parseKakaoChat'

describe('parseKakaoChat', () => {
  it('Message 컬럼에서 URL만 추출한다', () => {
    const csv = [
      'Date,User,Message',
      '2023-09-15 03:39:04,"김재균","https://youtube.com/watch?v=5r9zMi5tMHA&si=gUeLtH9yEVFrTXYy"',
    ].join('\n')

    const result = parseKakaoChat(csv)

    expect(result).toEqual([
      {
        title: 'https://youtube.com/watch?v=5r9zMi5tMHA&si=gUeLtH9yEVFrTXYy',
        url: 'https://youtube.com/watch?v=5r9zMi5tMHA&si=gUeLtH9yEVFrTXYy',
        folder_hint: [],
      },
    ])
  })

  it('URL 없는 메시지는 결과에서 제외한다', () => {
    const csv = [
      'Date,User,Message',
      '2023-09-15 19:18:02,"김재균","165 이후 장판 조심 바훈 아드x"',
    ].join('\n')

    expect(parseKakaoChat(csv)).toEqual([])
  })

  it('따옴표 안 줄바꿈을 포함한 멀티라인 메시지도 올바른 행으로 파싱한다', () => {
    const csv = [
      'Date,User,Message',
      '2023-09-15 19:18:02,"김재균","165 장판 조심\n\n155 중앙이동 https://example.com/guide 참고"',
      '2023-09-16 10:00:00,"박영희","https://github.com/example/repo"',
    ].join('\n')

    const result = parseKakaoChat(csv)

    expect(result).toEqual([
      { title: 'https://example.com/guide', url: 'https://example.com/guide', folder_hint: [] },
      { title: 'https://github.com/example/repo', url: 'https://github.com/example/repo', folder_hint: [] },
    ])
  })

  it('한 메시지에 URL이 여러 개면 각각 별도 항목으로 추출한다', () => {
    const csv = [
      'Date,User,Message',
      '2023-09-15 03:39:04,"김재균","https://a.com https://b.com"',
    ].join('\n')

    const result = parseKakaoChat(csv)

    expect(result).toEqual([
      { title: 'https://a.com', url: 'https://a.com', folder_hint: [] },
      { title: 'https://b.com', url: 'https://b.com', folder_hint: [] },
    ])
  })

  it('Message 헤더 없으면 빈 배열 반환', () => {
    expect(parseKakaoChat('Date,User\n2023-09-15,철수')).toEqual([])
  })
})
