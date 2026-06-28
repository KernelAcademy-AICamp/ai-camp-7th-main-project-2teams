import { describe, it, expect, vi, beforeEach } from 'vitest'

// saveCurrentTab 핵심 로직 단위 테스트 (background/index.js에서 추출)
function makeSaveCurrentTab({ supabase, chromeMock, fetchMock, WEB_APP_URL }) {
  return async function saveCurrentTab() {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) return { error: 'not authenticated' }

    const [tab] = await chromeMock.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return { error: 'no active tab' }

    const contentRes = await new Promise((resolve) => {
      chromeMock.tabs.sendMessage(tab.id, { type: 'GET_CONTENT' }, (res) => resolve(res))
    })

    const res = await fetchMock(`${WEB_APP_URL}/api/bookmarks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
      body: JSON.stringify({
        url: tab.url ?? '',
        title: tab.title ?? '',
        content: contentRes?.content ?? '',
      }),
    })

    if (!res.ok) return { error: `HTTP ${res.status}` }
    return res.json()
  }
}

describe('saveCurrentTab', () => {
  let supabase, chromeMock, fetchMock

  beforeEach(() => {
    supabase = { auth: { getSession: vi.fn() } }
    chromeMock = {
      tabs: {
        query: vi.fn(),
        sendMessage: vi.fn(),
      },
    }
    fetchMock = vi.fn()
  })

  it('정상 저장 → bookmark 반환', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok123' } },
    })
    chromeMock.tabs.query.mockResolvedValue([{ id: 1, url: 'https://ex.com', title: '예시' }])
    chromeMock.tabs.sendMessage.mockImplementation((_id, _msg, cb) => cb({ content: '본문' }))
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ bookmark: { id: 'b1' } }),
    })

    const save = makeSaveCurrentTab({ supabase, chromeMock, fetchMock, WEB_APP_URL: 'http://localhost:3000' })
    const result = await save()

    expect(result).toEqual({ bookmark: { id: 'b1' } })
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

  it('API 500 → error 반환', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
    })
    chromeMock.tabs.query.mockResolvedValue([{ id: 1, url: 'https://x.com', title: 'X' }])
    chromeMock.tabs.sendMessage.mockImplementation((_id, _msg, cb) => cb({ content: '' }))
    fetchMock.mockResolvedValue({ ok: false, status: 500 })

    const save = makeSaveCurrentTab({ supabase, chromeMock, fetchMock, WEB_APP_URL: '' })
    const result = await save()

    expect(result).toEqual({ error: 'HTTP 500' })
  })

  it('content script 무응답 → content 빈 문자열로 전송', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
    })
    chromeMock.tabs.query.mockResolvedValue([{ id: 1, url: 'https://x.com', title: 'X' }])
    chromeMock.tabs.sendMessage.mockImplementation((_id, _msg, cb) => cb(undefined))
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ bookmark: { id: 'b2' } }),
    })

    const save = makeSaveCurrentTab({ supabase, chromeMock, fetchMock, WEB_APP_URL: '' })
    await save()

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.content).toBe('')
  })
})
