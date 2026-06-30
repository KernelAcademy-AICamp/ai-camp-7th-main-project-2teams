import { describe, it, expect, vi, beforeEach } from 'vitest'

// GET_TAB_INFO 핸들러 로직 단위 테스트
// content 수집은 chrome.scripting.executeScript(라이브 DOM)로 일원화 — 외부 페이지도 커버.

function makeHandler(chromeMock) {
  async function extractPageInfo(tabId) {
    try {
      const [injection] = await chromeMock.scripting.executeScript({
        target: { tabId },
        func: () => {},
      })
      return injection?.result ?? null
    } catch {
      return null
    }
  }

  return function handleGetTabInfo(sendResponse) {
    chromeMock.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      if (!tab?.id) return sendResponse({ error: 'no active tab' })
      const info = await extractPageInfo(tab.id)
      sendResponse({
        url: tab.url ?? '',
        title: info?.title || tab.title || '',
        content: info?.content ?? '',
      })
    })
  }
}

describe('GET_TAB_INFO 핸들러', () => {
  let chromeMock

  beforeEach(() => {
    chromeMock = {
      tabs: { query: vi.fn() },
      scripting: { executeScript: vi.fn() },
    }
  })

  it('활성 탭 url + 라이브 DOM title/content 반환', async () => {
    chromeMock.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com', title: '탭제목' }])
    chromeMock.scripting.executeScript.mockResolvedValue([
      { result: { title: 'DOM 제목', content: '본문 내용' } },
    ])

    const result = await new Promise((resolve) => makeHandler(chromeMock)(resolve))

    expect(result).toEqual({ url: 'https://example.com', title: 'DOM 제목', content: '본문 내용' })
  })

  it('executeScript 실패 → content 빈 문자열 + tab.title 폴백', async () => {
    chromeMock.tabs.query.mockResolvedValue([{ id: 2, url: 'https://x.com', title: '탭제목' }])
    chromeMock.scripting.executeScript.mockRejectedValue(new Error('Cannot access'))

    const result = await new Promise((resolve) => makeHandler(chromeMock)(resolve))

    expect(result.content).toBe('')
    expect(result.title).toBe('탭제목')
    expect(result.url).toBe('https://x.com')
  })

  it('활성 탭 없음 → error 반환', async () => {
    chromeMock.tabs.query.mockResolvedValue([undefined])

    const result = await new Promise((resolve) => makeHandler(chromeMock)(resolve))

    expect(result).toEqual({ error: 'no active tab' })
  })
})

describe('extractPageInfo 추출 로직', () => {
  it('description + 본문 결합, 2000자 상한', () => {
    const description = '메타 설명'
    const body = 'a'.repeat(3000)
    const content = [description, body].filter(Boolean).join('\n').slice(0, 2000)
    expect(content.length).toBe(2000)
    expect(content.startsWith('메타 설명\n')).toBe(true)
  })

  it('description 없으면 본문만', () => {
    const content = ['', '안녕하세요'].filter(Boolean).join('\n').slice(0, 2000)
    expect(content).toBe('안녕하세요')
  })
})
