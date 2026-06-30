export interface ParsedBookmark {
  title: string
  url: string
  /** 상위 폴더명 배열 (루트 항목은 빈 배열) */
  folder_hint: string[]
}

/** 무한 중첩 방어: 폴더 스택 최대 깊이 */
const MAX_DEPTH = 20

/** 크롬 기본 폴더 — folder_hint에서 제외 (KO·EN export 변형 포함) */
const DEFAULT_FOLDERS = new Set([
  '북마크바',
  '북마크 바',
  'bookmarks bar',
  'bookmarks toolbar',
  '기타 북마크',
  '다른 북마크',
  'other bookmarks',
  '모바일 북마크',
  'mobile bookmarks',
])

/** 기본 폴더 여부 — 공백 정규화 + 소문자 비교 */
export function isDefaultFolder(name: string): boolean {
  return DEFAULT_FOLDERS.has(name.toLowerCase().replace(/\s+/g, ' ').trim())
}

/** 잔여 HTML 태그 제거 (`<b>AT</b>` → `AT`) */
function stripTags(text: string): string {
  return text.replace(/<[^>]*>/g, '')
}

/**
 * HTML 엔티티 디코드.
 * strip → decode 순서 권장: `<b>AT&amp;T</b>` → `AT&amp;T` → `AT&T`
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
}

/** 태그 제거 후 엔티티 디코드 — title·폴더명에 적용 */
function cleanText(text: string): string {
  return decodeHtmlEntities(stripTags(text)).trim()
}

/**
 * Netscape 북마크 포맷 HTML을 파싱해 북마크 목록을 반환.
 *
 * 토크나이저 방식: 정규식으로 DL 진입/탈출·H3 폴더·A 북마크를 문서 순서대로 스캔.
 * 외부 라이브러리 없음 — 순수 함수.
 *
 * 폴더 계층 추적:
 *   1. <DT><H3>폴더명</H3> → pendingFolder 기록
 *   2. 다음 <DL> → pendingFolder를 folderStack에 push
 *   3. </DL> → folderStack에서 pop
 */
export function parseNetscapeBookmarks(html: string): ParsedBookmark[] {
  const results: ParsedBookmark[] = []
  const folderStack: string[] = []
  let pendingFolder: string | null = null

  // 4가지 토큰을 문서 순서대로 캡처 (numbered groups — ES2017 호환)
  // match[1]: dl_open  — <DL ...>
  // match[2]: dl_close — </DL>
  // match[3]: folder   — <H3>폴더명</H3> 의 내용
  // match[4]: href     — <A HREF="url"> 또는 <A HREF='url'> 의 URL
  // match[5]: atitle   — 위 A 태그의 텍스트
  // href: 이중/단일 인용부호 모두 허용
  const TOKEN_RE =
    /(<DL\b[^>]*>)|(<\/DL[^>]*>)|<DT[^>]*>\s*<H3[^>]*>([\s\S]*?)<\/H3>|<DT[^>]*>\s*<A\s[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/A>/gi

  let match: RegExpExecArray | null
  while ((match = TOKEN_RE.exec(html)) !== null) {
    const [, dl_open, dl_close, folder, href, atitle] = match

    if (dl_open !== undefined) {
      // DL 진입: 직전 H3 폴더명이 있으면 스택에 push
      if (pendingFolder !== null) {
        // 무한 중첩 방어: MAX_DEPTH 초과 시 push 스킵
        if (folderStack.length < MAX_DEPTH) {
          folderStack.push(pendingFolder)
        }
        pendingFolder = null
      }
    } else if (dl_close !== undefined) {
      // DL 탈출: 스택 pop (루트 DL underflow는 무시)
      if (folderStack.length > 0) {
        folderStack.pop()
      }
    } else if (folder !== undefined) {
      // H3 폴더명 — cleanText 적용 후 다음 DL 진입 시 push
      pendingFolder = cleanText(folder)
    } else if (href !== undefined) {
      const url = href.trim()
      // http/https 외 URL 스킵 (javascript:, data: 등 방어)
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        continue
      }
      // cleanText: 잔여 태그 제거 + 엔티티 디코드
      const title = cleanText(atitle ?? '') || url
      results.push({
        title,
        url,
        // 기본 폴더 제외 — stack push/pop 대칭은 유지하고 결과에서만 필터
        folder_hint: folderStack.filter((f) => !isDefaultFolder(f)),
      })
    }
  }

  return results
}
