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
    expect(meta).toEqual({
      title: '영상 제목',
      description: 'ZeroCho TV 채널',
      thumbnailUrl: '',
    })
    // oEmbed 엔드포인트 호출 확인
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('/oembed')
  })

  it('oEmbed thumbnail_url → thumbnailUrl로 매핑', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        json: {
          title: '영상 제목',
          author_name: 'ZeroCho TV',
          thumbnail_url: 'https://i.ytimg.com/vi/abc/hqdefault.jpg',
        },
      }),
    )
    const meta = await fetchMeta('https://www.youtube.com/watch?v=abc')
    expect(meta.thumbnailUrl).toBe('https://i.ytimg.com/vi/abc/hqdefault.jpg')
  })

  it('채널 메인(/@handle) → og:title이 50KB 밖이어도 추출(채널 캡 상향)', async () => {
    // YouTube 채널 HTML은 og:title이 ~628KB 지점 → 기본 50KB 캡으로는 누락.
    const padding = 'x'.repeat(60_000)
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ ok: false, status: 404 })) // oEmbed 404
      .mockResolvedValueOnce(
        mockResponse({
          ok: true,
          text: `<head>${padding}<meta property="og:title" content="구디사는 개발자 9Diin"><meta property="og:description" content="개발 채널"></head>`,
        }),
      )
    const meta = await fetchMeta('https://www.youtube.com/@9diin')
    expect(meta.title).toBe('구디사는 개발자 9Diin')
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
    expect(meta).toEqual({ title: 'ZeroCho TV', description: '웹 개발 강의', thumbnailUrl: '' })
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
      thumbnailUrl: '',
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
    expect(await fetchMeta('https://example.com')).toEqual({
      title: '',
      description: '',
      thumbnailUrl: '',
    })
  })

  it('fetch 예외 → 빈 값', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network'))
    expect(await fetchMeta('https://example.com')).toEqual({
      title: '',
      description: '',
      thumbnailUrl: '',
    })
  })

  it('og:image 추출 → 절대 URL 그대로 사용', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        text: '<title>예시</title><meta property="og:image" content="https://example.com/thumb.jpg">',
      }),
    )
    const meta = await fetchMeta('https://example.com')
    expect(meta.thumbnailUrl).toBe('https://example.com/thumb.jpg')
  })

  it('og:image 상대경로 → page URL 기준 절대경로로 변환', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        text: '<title>예시</title><meta property="og:image" content="/assets/thumb.jpg">',
      }),
    )
    const meta = await fetchMeta('https://example.com/post/1')
    expect(meta.thumbnailUrl).toBe('https://example.com/assets/thumb.jpg')
  })

  it('og:image 없으면 twitter:image 폴백', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        text: '<meta name="twitter:image" content="https://example.com/tw.jpg">',
      }),
    )
    const meta = await fetchMeta('https://example.com')
    expect(meta.thumbnailUrl).toBe('https://example.com/tw.jpg')
  })

  it('og:image가 data: URI면 버림 (thumbnailUrl 빈 값)', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        text: '<meta property="og:image" content="data:image/png;base64,AAAA">',
      }),
    )
    const meta = await fetchMeta('https://example.com')
    expect(meta.thumbnailUrl).toBe('')
  })
})
