import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchMeta } from '../fetchMeta'

afterEach(() => vi.restoreAllMocks())

function mockResponse(body: { ok: boolean; status?: number; text?: string; json?: unknown }) {
  return {
    ok: body.ok,
    status: body.status ?? (body.ok ? 200 : 500),
    text: async () => body.text ?? '',
    json: async () => body.json ?? {},
  } as Response
}

describe('fetchMeta — YouTube oEmbed', () => {
  it('영상 URL → oEmbed title + 채널명 설명', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({ ok: true, json: { title: '영상 제목', author_name: 'ZeroCho TV' } }),
    )
    const meta = await fetchMeta('https://www.youtube.com/watch?v=abc')
    expect(meta).toEqual({ title: '영상 제목', description: 'ZeroCho TV 채널' })
    // oEmbed 엔드포인트 호출 확인
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('/oembed')
  })

  it('채널 URL → oEmbed 404 → HTML 폴백(og:title/description)', async () => {
    global.fetch = vi
      .fn()
      // 1) oEmbed 404
      .mockResolvedValueOnce(mockResponse({ ok: false, status: 404 }))
      // 2) HTML fetch
      .mockResolvedValueOnce(
        mockResponse({
          ok: true,
          text: '<meta property="og:title" content="ZeroCho TV"><meta property="og:description" content="웹 개발 강의">',
        }),
      )
    const meta = await fetchMeta('https://www.youtube.com/channel/UCxxxx')
    expect(meta).toEqual({ title: 'ZeroCho TV', description: '웹 개발 강의' })
  })
})

describe('fetchMeta — 일반 페이지', () => {
  it('<title> + og:description 추출', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        text: '<title>예시 페이지</title><meta property="og:description" content="설명문">',
      }),
    )
    expect(await fetchMeta('https://example.com')).toEqual({
      title: '예시 페이지',
      description: '설명문',
    })
  })

  it('<title> 없으면 og:title 폴백', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({ ok: true, text: '<meta name="twitter:title" content="트위터 제목">' }),
    )
    const meta = await fetchMeta('https://example.com')
    expect(meta.title).toBe('트위터 제목')
  })

  it('응답 실패(!ok) → 빈 값', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 500 }))
    expect(await fetchMeta('https://example.com')).toEqual({ title: '', description: '' })
  })

  it('fetch 예외 → 빈 값', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network'))
    expect(await fetchMeta('https://example.com')).toEqual({ title: '', description: '' })
  })
})
