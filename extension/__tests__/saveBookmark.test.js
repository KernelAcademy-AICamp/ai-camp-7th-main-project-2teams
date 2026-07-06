import { describe, it, expect, vi, beforeEach } from 'vitest'

// saveCurrentTab 핵심 로직 단위 테스트 (background/index.js에서 추출)
// content 수집은 chrome.scripting.executeScript(라이브 DOM)로 일원화 — 외부 페이지도 커버.
function makeSaveCurrentTab({ supabase, chromeMock, fetchMock, WEB_APP_URL }) {
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

  return async function saveCurrentTab() {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) return { error: 'not authenticated' }

    const [tab] = await chromeMock.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return { error: 'no active tab' }
    if (!tab.url) return { error: 'tab url unavailable' }

    const info = await extractPageInfo(tab.id)

    const res = await fetchMock(`${WEB_APP_URL}/api/bookmarks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
      body: JSON.stringify({
        url: tab.url ?? '',
        title: info?.title || tab.title || '',
        content: info?.content ?? '',
      }),
    })

    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      return { error: json.error || `HTTP ${res.status}`, duplicate: json.duplicate === true }
    }
    return res.json()
  }
}

describe('saveCurrentTab', () => {
  let supabase, chromeMock, fetchMock

  beforeEach(() => {
    supabase = { auth: { getSession: vi.fn() } }
    chromeMock = {
      tabs: { query: vi.fn() },
      scripting: { executeScript: vi.fn() },
    }
    fetchMock = vi.fn()
  })

  it('정상 저장 → 라이브 DOM title/content 전송 + bookmark 반환', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok123' } },
    })
    chromeMock.tabs.query.mockResolvedValue([{ id: 1, url: 'https://ex.com', title: '탭제목' }])
    chromeMock.scripting.executeScript.mockResolvedValue([
      { result: { title: 'DOM 제목', content: '메타 설명\n본문' } },
    ])
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ bookmark: { id: 'b1' } }),
    })

    const save = makeSaveCurrentTab({ supabase, chromeMock, fetchMock, WEB_APP_URL: 'http://localhost:3000' })
    const result = await save()

    expect(result).toEqual({ bookmark: { id: 'b1' } })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.title).toBe('DOM 제목')
    expect(body.content).toBe('메타 설명\n본문')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/bookmarks',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok123' }),
      })
    )
  })

  it('미인증 → error 반환', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })

    const save = makeSaveCurrentTab({ supabase, chromeMock, fetchMock, WEB_APP_URL: '' })
    const result = await save()

    expect(result).toEqual({ error: 'not authenticated' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('활성 탭 없음 → error 반환', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
    })
    chromeMock.tabs.query.mockResolvedValue([undefined])

    const save = makeSaveCurrentTab({ supabase, chromeMock, fetchMock, WEB_APP_URL: '' })
    const result = await save()

    expect(result).toEqual({ error: 'no active tab' })
  })

  it('API 500 → error 반환 (응답 바디 파싱 실패 시 상태코드 기반 메시지 폴백)', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
    })
    chromeMock.tabs.query.mockResolvedValue([{ id: 1, url: 'https://x.com', title: 'X' }])
    chromeMock.scripting.executeScript.mockResolvedValue([{ result: { title: 'X', content: '' } }])
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('no body')),
    })

    const save = makeSaveCurrentTab({ supabase, chromeMock, fetchMock, WEB_APP_URL: '' })
    const result = await save()

    expect(result).toEqual({ error: 'HTTP 500', duplicate: false })
  })

  it('API 409 중복 응답 → 서버 한국어 메시지 + duplicate:true 그대로 반환 (A59)', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
    })
    chromeMock.tabs.query.mockResolvedValue([{ id: 1, url: 'https://dup.com', title: 'DUP' }])
    chromeMock.scripting.executeScript.mockResolvedValue([{ result: { title: 'DUP', content: '' } }])
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ error: '이미 저장된 북마크입니다.', duplicate: true }),
    })

    const save = makeSaveCurrentTab({ supabase, chromeMock, fetchMock, WEB_APP_URL: '' })
    const result = await save()

    expect(result).toEqual({ error: '이미 저장된 북마크입니다.', duplicate: true })
  })

  it('executeScript 주입 불가(chrome:// 등) → content 빈 문자열 + tab.title 폴백', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
    })
    chromeMock.tabs.query.mockResolvedValue([{ id: 1, url: 'https://x.com', title: '탭제목' }])
    chromeMock.scripting.executeScript.mockRejectedValue(new Error('Cannot access'))
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ bookmark: { id: 'b2' } }),
    })

    const save = makeSaveCurrentTab({ supabase, chromeMock, fetchMock, WEB_APP_URL: '' })
    await save()

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.content).toBe('')
    expect(body.title).toBe('탭제목')
  })
})
