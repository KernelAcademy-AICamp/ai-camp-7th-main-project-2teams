import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { parseNetscapeBookmarks } from '../parseNetscapeBookmarks'

// __fixtures__/bookmarks.html 기준 경로
const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../__fixtures__/bookmarks.html',
)

// 테스트용 인라인 샘플 (폴더 2단계 + 북마크 4개 + javascript: 1개)
const SAMPLE_HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><H3 ADD_DATE="1">개발</H3>
    <DL><p>
        <DT><H3 ADD_DATE="2">프론트엔드</H3>
        <DL><p>
            <DT><A HREF="https://nextjs.org/docs" ADD_DATE="3">Next.js 공식 문서</A>
            <DT><A HREF="https://react.dev" ADD_DATE="4">React 공식 문서</A>
        </DL><p>
        <DT><A HREF="https://github.com/vercel/next.js" ADD_DATE="5">Next.js GitHub</A>
    </DL><p>
    <DT><A HREF="https://example.com" ADD_DATE="6">루트 북마크</A>
    <DT><A HREF="javascript:void(0)" ADD_DATE="7">스킵될 링크</A>
</DL><p>`

describe('parseNetscapeBookmarks', () => {
  describe('정상 파싱', () => {
    it('title·url·folder_hint 올바르게 추출', () => {
      const result = parseNetscapeBookmarks(SAMPLE_HTML)
      expect(result).toHaveLength(4)

      expect(result[0]).toEqual({
        title: 'Next.js 공식 문서',
        url: 'https://nextjs.org/docs',
        folder_hint: ['개발', '프론트엔드'],
      })
      expect(result[1]).toEqual({
        title: 'React 공식 문서',
        url: 'https://react.dev',
        folder_hint: ['개발', '프론트엔드'],
      })
      expect(result[2]).toEqual({
        title: 'Next.js GitHub',
        url: 'https://github.com/vercel/next.js',
        folder_hint: ['개발'],
      })
      expect(result[3]).toEqual({
        title: '루트 북마크',
        url: 'https://example.com',
        folder_hint: [],
      })
    })

    it('루트 항목 folder_hint는 빈 배열', () => {
      const html = `<DL><p>
        <DT><A HREF="https://root.com">Root</A>
      </DL><p>`
      const result = parseNetscapeBookmarks(html)
      expect(result[0].folder_hint).toEqual([])
    })

    it('단일 폴더 계층 — folder_hint에 폴더명 포함', () => {
      const html = `<DL><p>
        <DT><H3>Tools</H3>
        <DL><p>
          <DT><A HREF="https://tool.com">Tool</A>
        </DL><p>
      </DL><p>`
      const result = parseNetscapeBookmarks(html)
      expect(result[0].folder_hint).toEqual(['Tools'])
    })

    it('ADD_DATE·ICON 등 추가 속성 무시', () => {
      const html = `<DL><p>
        <DT><A HREF="https://example.com" ADD_DATE="1700000000" ICON="data:image/png;base64,abc=">Title</A>
      </DL><p>`
      const result = parseNetscapeBookmarks(html)
      expect(result[0].url).toBe('https://example.com')
      expect(result[0].title).toBe('Title')
    })

    it('__fixtures__/bookmarks.html 파싱 — 5개 추출 (javascript: 1개 스킵)', () => {
      const html = readFileSync(FIXTURE_PATH, 'utf-8')
      const result = parseNetscapeBookmarks(html)
      expect(result).toHaveLength(5)
      // folder_hint 검증
      expect(result[0].folder_hint).toEqual(['개발', '프론트엔드'])
      expect(result[2].folder_hint).toEqual(['개발'])
      expect(result[3].folder_hint).toEqual([])
      // 엔티티 디코딩 — 픽스처의 "개발 &amp; 디자인" 항목
      expect(result[4].title).toBe('개발 & 디자인')
    })
  })

  describe('URL 필터링', () => {
    it('javascript: URL 스킵', () => {
      const result = parseNetscapeBookmarks(SAMPLE_HTML)
      const urls = result.map((b) => b.url)
      expect(urls).not.toContain('javascript:void(0)')
    })

    it('data: URL 스킵', () => {
      const html = `<DL><p>
        <DT><A HREF="data:text/html,<h1>test</h1>">Data</A>
        <DT><A HREF="https://valid.com">Valid</A>
      </DL><p>`
      const result = parseNetscapeBookmarks(html)
      expect(result).toHaveLength(1)
      expect(result[0].url).toBe('https://valid.com')
    })

    it('http와 https 모두 허용', () => {
      const html = `<DL><p>
        <DT><A HREF="http://old.com">HTTP</A>
        <DT><A HREF="https://new.com">HTTPS</A>
      </DL><p>`
      const result = parseNetscapeBookmarks(html)
      expect(result).toHaveLength(2)
    })
  })

  describe('경계 케이스', () => {
    it('빈 문자열 → 빈 배열', () => {
      expect(parseNetscapeBookmarks('')).toEqual([])
    })

    it('북마크 없는 HTML → 빈 배열', () => {
      expect(
        parseNetscapeBookmarks('<html><body>북마크 없음</body></html>'),
      ).toEqual([])
    })

    it('함수 재호출 시 상태 오염 없음 (regex lastIndex 격리)', () => {
      const r1 = parseNetscapeBookmarks(SAMPLE_HTML)
      const r2 = parseNetscapeBookmarks(SAMPLE_HTML)
      expect(r1).toEqual(r2)
    })
  })

  describe('HTML entity 디코딩', () => {
    it('&amp; → & 디코딩', () => {
      const html = `<DL><p>
        <DT><A HREF="https://example.com">개발 &amp; 디자인</A>
      </DL><p>`
      const result = parseNetscapeBookmarks(html)
      expect(result[0].title).toBe('개발 & 디자인')
    })

    it('&lt; &gt; &quot; &#39; 디코딩', () => {
      const html = `<DL><p>
        <DT><A HREF="https://example.com">AT&amp;T &lt;2024&gt; &quot;hello&quot; &#39;world&#39;</A>
      </DL><p>`
      const result = parseNetscapeBookmarks(html)
      expect(result[0].title).toBe("AT&T <2024> \"hello\" 'world'")
    })

    it('&#NN; 숫자 엔티티 디코딩', () => {
      const html = `<DL><p>
        <DT><A HREF="https://example.com">Hello&#33;</A>
      </DL><p>`
      const result = parseNetscapeBookmarks(html)
      expect(result[0].title).toBe('Hello!')
    })

    it('폴더명 엔티티도 디코딩', () => {
      const html = `<DL><p>
        <DT><H3>개발 &amp; AI</H3>
        <DL><p>
          <DT><A HREF="https://example.com">Link</A>
        </DL><p>
      </DL><p>`
      const result = parseNetscapeBookmarks(html)
      expect(result[0].folder_hint).toEqual(['개발 & AI'])
    })
  })

  describe('단일 인용부호 href', () => {
    it("href='...' 단일따옴표도 파싱", () => {
      const html = `<DL><p>
        <DT><A HREF='https://single-quote.com' ADD_DATE="1">Single Quote</A>
      </DL><p>`
      const result = parseNetscapeBookmarks(html)
      expect(result).toHaveLength(1)
      expect(result[0].url).toBe('https://single-quote.com')
      expect(result[0].title).toBe('Single Quote')
    })

    it('이중/단일 인용부호 혼재 시 모두 파싱', () => {
      const html = `<DL><p>
        <DT><A HREF="https://double.com">Double</A>
        <DT><A HREF='https://single.com'>Single</A>
      </DL><p>`
      const result = parseNetscapeBookmarks(html)
      expect(result).toHaveLength(2)
      expect(result[0].url).toBe('https://double.com')
      expect(result[1].url).toBe('https://single.com')
    })
  })
})
