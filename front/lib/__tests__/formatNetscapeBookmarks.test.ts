import { describe, it, expect } from 'vitest'
import { formatNetscapeBookmarks } from '../formatNetscapeBookmarks'
import { parseNetscapeBookmarks } from '../parseNetscapeBookmarks'

describe('formatNetscapeBookmarks', () => {
  it('폴더 계층 없는 북마크는 루트 DL에 직접 렌더링', () => {
    const html = formatNetscapeBookmarks([
      { title: '예시', url: 'https://example.com', tags: [], category_name: null, folder_hint: null },
    ])
    expect(html).toContain('<A HREF="https://example.com">예시</A>')
    expect(html).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>')
  })

  it('folder_hint 배열대로 중첩 DL/H3 생성', () => {
    const html = formatNetscapeBookmarks([
      { title: 'Next.js', url: 'https://nextjs.org', tags: [], category_name: null, folder_hint: ['개발', '프론트엔드'] },
    ])
    const parsed = parseNetscapeBookmarks(html)
    expect(parsed[0].folder_hint).toEqual(['개발', '프론트엔드'])
  })

  it('tags·category_name 있으면 TAGS·DATA_CATEGORY 속성으로 심음', () => {
    const html = formatNetscapeBookmarks([
      { title: 'Next.js', url: 'https://nextjs.org', tags: ['프론트엔드'], category_name: '개발', folder_hint: null },
    ])
    expect(html).toContain('TAGS="프론트엔드"')
    expect(html).toContain('DATA_CATEGORY="개발"')
  })

  it('tags 없으면 TAGS 속성 자체를 생략', () => {
    const html = formatNetscapeBookmarks([
      { title: 'Next.js', url: 'https://nextjs.org', tags: [], category_name: null, folder_hint: null },
    ])
    expect(html).not.toContain('TAGS=')
    expect(html).not.toContain('DATA_CATEGORY=')
  })

  it('제목·URL의 HTML 특수문자 이스케이프', () => {
    const html = formatNetscapeBookmarks([
      { title: 'A&B <script>', url: 'https://example.com/?a=1&b=2', tags: [], category_name: null, folder_hint: null },
    ])
    expect(html).toContain('A&amp;B &lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('내보낸 HTML을 다시 파싱하면 title·url·folder_hint·tags·category_name 왕복 복원', () => {
    const html = formatNetscapeBookmarks([
      { title: '리액트 공식 문서', url: 'https://react.dev', tags: ['프론트엔드', '리액트'], category_name: '개발', folder_hint: ['개발'] },
    ])
    const parsed = parseNetscapeBookmarks(html)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toEqual({
      title: '리액트 공식 문서',
      url: 'https://react.dev',
      folder_hint: ['개발'],
      tags: ['프론트엔드', '리액트'],
      category_name: '개발',
    })
  })
})
