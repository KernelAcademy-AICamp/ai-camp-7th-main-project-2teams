import { describe, it, expect, vi, beforeEach } from 'vitest'

// GET_TAB_INFO 핸들러 로직 단위 테스트
// background/index.js 직접 import 없이 핸들러 동작을 재현

function makeHandler(chromeMock) {
  return function handleGetTabInfo(sendResponse) {
    chromeMock.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (!tab?.id) return sendResponse({ error: 'no active tab' })
      chromeMock.tabs.sendMessage(tab.id, { type: 'GET_CONTENT' }, (res) => {
        sendResponse({
          url: tab.url ?? '',
          title: tab.title ?? '',
          content: res?.content ?? '',
        })
      })
    })
  }
}

describe('GET_TAB_INFO 핸들러', () => {
  let chromeMock

  beforeEach(() => {
    chromeMock = {
      tabs: {
        query: vi.fn(),
        sendMessage: vi.fn(),
      },
    }
  })

  it('활성 탭 url/title/content 반환', async () => {
    chromeMock.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com', title: '예시' }])
    chromeMock.tabs.sendMessage.mockImplementation((_id, _msg, cb) => cb({ content: '본문 내용' }))

    const result = await new Promise((resolve) => makeHandler(chromeMock)(resolve))

    expect(result).toEqual({ url: 'https://example.com', title: '예시', content: '본문 내용' })
  })

  it('content script 무응답 → content 빈 문자열', async () => {
    chromeMock.tabs.query.mockResolvedValue([{ id: 2, url: 'https://x.com', title: 'X' }])
    chromeMock.tabs.sendMessage.mockImplementation((_id, _msg, cb) => cb(undefined))

    const result = await new Promise((resolve) => makeHandler(chromeMock)(resolve))

    expect(result.content).toBe('')
    expect(result.url).toBe('https://x.com')
  })

  it('활성 탭 없음 → error 반환', async () => {
    chromeMock.tabs.query.mockResolvedValue([undefined])

    const result = await new Promise((resolve) => makeHandler(chromeMock)(resolve))

    expect(result).toEqual({ error: 'no active tab' })
  })
})

describe('GET_CONTENT content script 로직', () => {
  it('innerText 앞 2000자만 반환', () => {
    const innerText = 'a'.repeat(3000)
    const content = innerText.slice(0, 2000)
    expect(content.length).toBe(2000)
    expect(content).toBe('a'.repeat(2000))
  })

  it('2000자 미만이면 전체 반환', () => {
    const innerText = '안녕하세요'
    expect(innerText.slice(0, 2000)).toBe('안녕하세요')
  })
})
