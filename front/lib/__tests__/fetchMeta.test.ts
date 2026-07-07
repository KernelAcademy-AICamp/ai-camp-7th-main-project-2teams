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
      content: 'ZeroCho TV 채널',
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
    expect(meta).toEqual({
      title: 'ZeroCho TV',
      description: '웹 개발 강의',
      thumbnailUrl: '',
      content: '웹 개발 강의',
    })
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
      content: '설명문',
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
      content: '',
    })
  })

  it('fetch 예외 → 빈 값', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network'))
    expect(await fetchMeta('https://example.com')).toEqual({
      title: '',
      description: '',
      thumbnailUrl: '',
      content: '',
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

describe('fetchMeta — content(임베딩용 본문 텍스트)', () => {
  it('본문 텍스트를 포함한 content 반환, script/style 텍스트는 제외', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        text:
          '<title>t</title>' +
          '<script>var x = "스크립트 텍스트";</script>' +
          '<style>.a{color:red /* 스타일 텍스트 */}</style>' +
          '<meta property="og:description" content="요약문">' +
          '<body>실제 본문 내용입니다</body>',
      }),
    )
    const meta = await fetchMeta('https://example.com')
    expect(meta.content).toBe('요약문\n실제 본문 내용입니다')
    expect(meta.content).not.toContain('스크립트')
    expect(meta.content).not.toContain('스타일')
  })

  it('본문이 2000자 초과하면 정확히 2000자로 자름', async () => {
    const longBody = '가'.repeat(3000)
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({ ok: true, text: `<body>${longBody}</body>` }),
    )
    const meta = await fetchMeta('https://example.com')
    expect(meta.content).toHaveLength(2000)
  })

  it('og:description 없고 본문만 있으면 content = 본문 텍스트', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({ ok: true, text: '<body>본문만 있음</body>' }),
    )
    const meta = await fetchMeta('https://example.com')
    expect(meta.content).toBe('본문만 있음')
  })

  it('YouTube oEmbed 경로 → content = description(채널명)과 동일', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({ ok: true, json: { title: '영상 제목', author_name: 'ZeroCho TV' } }),
    )
    const meta = await fetchMeta('https://www.youtube.com/watch?v=abc')
    expect(meta.content).toBe('ZeroCho TV 채널')
    expect(meta.content).toBe(meta.description)
  })
})

describe('fetchMeta — HTML 엔티티 디코드', () => {
  it('title/description의 &amp; &quot; &#x2705; 등을 실제 문자로 디코드', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        text:
          '<title>A &amp; B &quot;test&quot;</title>' +
          '<meta property="og:description" content="체크 &#x2705; 완료">',
      }),
    )
    const meta = await fetchMeta('https://example.com')
    expect(meta.title).toBe('A & B "test"')
    expect(meta.description).toBe('체크 ✅ 완료')
  })

  it('범위 밖 숫자 문자 참조(&#99999999999;)가 있어도 RangeError 없이 나머지 title/description을 보존', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        text:
          '<title>정상 제목 &#99999999999; 뒷부분</title>' +
          '<meta property="og:description" content="정상 설명 &#99999999999; 유지">',
      }),
    )
    const meta = await fetchMeta('https://example.com')
    // String.fromCodePoint가 RangeError를 던지면 fetchMeta 전체가 catch로 무너져 전부 빈 문자열이 됨 —
    // 그 회귀를 잡기 위해 나머지 유효한 텍스트가 그대로 보존되는지 확인.
    expect(meta.title).toContain('정상 제목')
    expect(meta.title).toContain('뒷부분')
    expect(meta.description).toContain('정상 설명')
    expect(meta.description).toContain('유지')
  })

  it('제어문자 숫자 참조(&#0; 등)는 title/description/content에서 제거됨', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        text:
          '<title>제목&#0;제목뒤</title>' +
          '<meta property="og:description" content="설명&#7;앞&#27;뒤">' +
          '<body>본문&#0;내용</body>',
      }),
    )
    const meta = await fetchMeta('https://example.com')
    // NUL 등은 Postgres text 컬럼 삽입 시 오류를 유발하므로 결과에 남아있으면 안 됨.
    expect(meta.title).not.toMatch(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/)
    expect(meta.description).not.toMatch(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/)
    expect(meta.content).not.toMatch(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/)
    expect(meta.title).toBe('제목제목뒤')
    expect(meta.description).toBe('설명앞뒤')
  })
})

describe('fetchMeta — ReDoS 방어(태그 스트리핑 정규식)', () => {
  it('50KB 연속 "<" 문자가 있어도 빠르게 처리됨(재앙적 백트래킹 없음)', async () => {
    const adversarial = '<'.repeat(50_000)
    global.fetch = vi.fn().mockResolvedValue(mockResponse({ ok: true, text: adversarial }))

    const start = Date.now()
    await fetchMeta('https://example.com')
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(500)
  })

  it('50KB 분량의 닫히지 않은 <script> 태그 반복이 있어도 빠르게 처리됨', async () => {
    const adversarial = '<script>'.repeat(6250) // 8자 * 6250 = 50,000자, 닫는 </script> 없음
    global.fetch = vi.fn().mockResolvedValue(mockResponse({ ok: true, text: adversarial }))

    const start = Date.now()
    await fetchMeta('https://example.com')
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(500)
  })
})

describe('fetchMeta — 긴 script/style content 누출 방지 (회귀)', () => {
  it('2000자 넘는 <script> 태그 content는 embedding content로 누출되지 않음', async () => {
    // 실제 페이지의 __NEXT_DATA__/GTM 스니펫처럼 2KB를 넘는 인라인 스크립트를 흉내낸 케이스.
    const marker = 'SCRIPT_MARKER_레도스수정후누출테스트'
    const longScript = `var payload = "${marker}"; ` + 'x'.repeat(5000)
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        text: `<title>t</title><script>${longScript}</script><body>실제 본문</body>`,
      }),
    )
    const meta = await fetchMeta('https://example.com')
    expect(meta.content).not.toContain(marker)
    expect(meta.content).toContain('실제 본문')
  })

  it('2000자 넘는 <style> 태그 content는 embedding content로 누출되지 않음', async () => {
    const marker = 'STYLE_MARKER_레도스수정후누출테스트'
    const longStyle = `.a{content:"${marker}"} ` + 'y'.repeat(5000)
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        text: `<title>t</title><style>${longStyle}</style><body>실제 본문</body>`,
      }),
    )
    const meta = await fetchMeta('https://example.com')
    expect(meta.content).not.toContain(marker)
    expect(meta.content).toContain('실제 본문')
  })
})

describe('fetchMeta — 닫는 태그 경계 미검증으로 인한 content 누출 (회귀)', () => {
  it('<style> content 안의 "</stylesheet-marker>" 부분 문자열에 조기 매치하지 않고 실제 </style>까지 스캔', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        text:
          '<title>t</title>' +
          '<style>.a{x:"</stylesheet-marker>"} .b{color:red} REAL_UNIQUE_LEAK_MARKER </style>' +
          '<body>실제 본문</body>',
      }),
    )
    const meta = await fetchMeta('https://example.com')
    expect(meta.content).not.toContain('REAL_UNIQUE_LEAK_MARKER')
    expect(meta.content).toContain('실제 본문')
  })

  it('<script> content 안의 "</scriptFOO>" 부분 문자열에 조기 매치하지 않고 실제 </script>까지 스캔', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        text:
          '<title>t</title>' +
          '<script>var s = "</scriptFOO>"; REAL_UNIQUE_LEAK_MARKER_2(); </script>' +
          '<body>실제 본문</body>',
      }),
    )
    const meta = await fetchMeta('https://example.com')
    expect(meta.content).not.toContain('REAL_UNIQUE_LEAK_MARKER_2')
    expect(meta.content).toContain('실제 본문')
  })

  it('여는 태그 직후 실제 닫는 태그(위양성 없음)인 정상 케이스도 그대로 동작', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        text: '<title>t</title><script></script><style></style><body>실제 본문</body>',
      }),
    )
    const meta = await fetchMeta('https://example.com')
    expect(meta.content).toBe('실제 본문')
  })

  it('닫는 태그 앞에 위양성("</scriptX")이 수천 번 반복돼도 빠르게 처리됨(searchFrom 전진, 백트래킹 없음)', async () => {
    const falsePositives = '</scriptX'.repeat(5000) // 진짜 닫는 태그가 아닌 부분 문자열 반복
    const text = `<title>t</title><script>${falsePositives}END_MARKER</script><body>실제 본문</body>`
    global.fetch = vi.fn().mockResolvedValue(mockResponse({ ok: true, text }))

    const start = Date.now()
    const meta = await fetchMeta('https://example.com')
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(500)
    expect(meta.content).not.toContain('END_MARKER')
    expect(meta.content).toContain('실제 본문')
  })
})
