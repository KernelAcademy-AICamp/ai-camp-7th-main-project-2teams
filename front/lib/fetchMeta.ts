// 서버사이드 전용 — 외부 URL에서 title/description/content 추출. content 없는 단일 북마크 추가 시 사용.

const FETCH_TIMEOUT_MS = 5000
const MAX_HTML = 50_000 // <head> 파싱에 충분, 대용량 바디 방지
// YouTube 채널 메인 페이지는 <title>/og:title이 ~630KB 지점에 있어 기본 캡으론 누락 → 상향.
const CHANNEL_MAX_HTML = 800_000
// 임베딩 입력용 본문 텍스트 상한 — extension/background/index.js의 동일 규칙과 값 일치.
// 코드 공유는 안 되므로(별도 저장소) 값 바꿀 때 양쪽 다 수정해야 함.
const MAX_CONTENT_LENGTH = 2000

function isYouTube(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return /(^|\.)youtube\.com$/.test(host) || host === 'youtu.be'
  } catch {
    return false
  }
}

// 채널·크리에이터 메인 페이지(/@handle·/channel·/c·/user) — oEmbed 미지원(404)이라 HTML 폴백 필요.
function isYouTubeChannel(url: string): boolean {
  try {
    const u = new URL(url)
    if (!/(^|\.)youtube\.com$/.test(u.hostname)) return false
    return /^\/(@[^/]+|channel\/|c\/|user\/)/.test(u.pathname)
  } catch {
    return false
  }
}

// YouTube는 봇 UA에 동의 페이지를 주거나 SSR title이 없어 HTML 파싱이 불안정 →
// oEmbed(공개 API, 키 불필요)로 영상 제목 + 채널명 + 공식 썸네일 URL 확보. 채널 URL은 oEmbed 404 → null로 폴백(HTML 시도).
async function fetchYouTubeOEmbed(
  url: string,
): Promise<{ title: string; description: string; thumbnailUrl: string } | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      title?: string
      author_name?: string
      thumbnail_url?: string
    }
    if (!data.title) return null
    return {
      title: data.title,
      description: data.author_name ? `${data.author_name} 채널` : '',
      thumbnailUrl: data.thumbnail_url ?? '',
    }
  } catch {
    return null
  }
}

// og:image가 상대경로일 수 있어 page URL 기준으로 절대경로화. http/https 아니면 버림(data: 등 방지).
function resolveImageUrl(raw: string, pageUrl: string): string {
  if (!raw) return ''
  try {
    const resolved = new URL(raw, pageUrl)
    if (resolved.protocol === 'http:' || resolved.protocol === 'https:') return resolved.href
  } catch {}
  return ''
}

// 이름 있는 HTML 엔티티 — meta content 속성값에 그대로 남아있던 버그(&amp; 등 미디코딩) 방지.
const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

// 유효 유니코드 코드포인트 상한 — 이 값을 넘기면 String.fromCodePoint가 RangeError를 던짐.
const MAX_CODE_POINT = 0x10ffff

// C0 제어문자(개행류 제외) + DEL — 숫자 엔티티로 유입되면 Postgres text 컬럼 삽입(NUL 등) 실패 유발.
function isStrippableControlCodePoint(codePoint: number): boolean {
  if (codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d) return false // \t \n \r는 유지
  return (codePoint >= 0x00 && codePoint <= 0x1f) || codePoint === 0x7f
}

// &amp; &#39; &#x2705; 등 이름/숫자/16진 엔티티 참조를 실제 문자로 디코드.
function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] === '#') {
      const codePoint =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10)
      // 범위 밖 코드포인트(예: &#99999999999;)는 String.fromCodePoint가 RangeError를 던져
      // fetchMeta 전체 결과가 catch로 조용히 무너지므로 — 원문 그대로 보존.
      if (Number.isNaN(codePoint) || codePoint < 0 || codePoint > MAX_CODE_POINT) return match
      if (isStrippableControlCodePoint(codePoint)) return ''
      return String.fromCodePoint(codePoint)
    }
    return NAMED_ENTITIES[body] ?? match
  })
}

// 여러 meta 태그 패턴을 순서대로 시도해 첫 content 값 반환 (속성 순서 무관 추출). 엔티티 디코드 포함.
function extractMetaContent(html: string, ...patterns: RegExp[]): string {
  for (const tagRe of patterns) {
    const tag = html.match(tagRe)?.[0]
    const content = tag?.match(/content=["']([^"']{1,1000})["']/i)?.[1]?.trim()
    if (content) return decodeHtmlEntities(content)
  }
  return ''
}

// 태그 이름 부분 문자열 매치 뒤에 오는 문자가 실제 태그 경계(>, /, 공백, 문자열 끝)인지 검사 —
// "<scriptx>" · "</scriptFOO>" 같은 위양성 부분 문자열 매치를 걸러내는 데 여는/닫는 태그 탐색
// 양쪽에서 공통으로 쓰인다.
function isTagBoundaryChar(char: string | undefined): boolean {
  return char === undefined || char === '>' || char === '/' || /\s/.test(char)
}

// "<태그이름" 부분 문자열 매치 뒤에 실제 태그 경계가 오는지 검증해 진짜 여는 태그만 찾는다.
// 과거엔 정규식 `<${tagName}\b[^<>]{0,200}>`로 속성 구간을 200자로 제한했으나, 실제 페이지에
// 흔한 긴 속성(data-*, nonce+integrity+crossorigin 등)이 200자를 넘으면 매치가 아예 실패해
// "태그 없음"으로 오판 → 남은 문서 전체(스크립트/스타일 원문 포함)가 그대로 누출되는 문제가
// 있었다. findClosingTagIndex와 동일하게 indexOf 기반 무제한 스캔으로 교체 — 속성 길이 제한 없음.
// fromIndex가 항상 이전 탐색 지점 이후로만 전진하므로(뒤로 재탐색 없음) 선형(O(n))을 유지한다.
function findOpenTagIndex(
  lowerHtml: string,
  tagName: string,
  fromIndex: number,
): { start: number; end: number } | null {
  const needle = `<${tagName}`
  let searchFrom = fromIndex
  for (;;) {
    const idx = lowerHtml.indexOf(needle, searchFrom)
    if (idx === -1) return null
    if (isTagBoundaryChar(lowerHtml[idx + needle.length])) {
      const tagEnd = lowerHtml.indexOf('>', idx)
      if (tagEnd === -1) return null // 여는 태그를 닫는 '>'가 끝까지 없음 — 매치 없음으로 처리
      return { start: idx, end: tagEnd + 1 }
    }
    searchFrom = idx + needle.length // 위양성(예: <scriptx>) — 계속 다음 위치부터 탐색
  }
}

// "</태그이름" 부분 문자열 매치 뒤에 실제 태그 경계가 오는지 검증해 진짜 닫는 태그만 찾는다.
// HTML 스펙의 "appropriate end tag" 매칭 규칙과 동일한 취지 — script/style content 안에
// "</scriptFOO>"처럼 우연히 겹치는 부분 문자열이 있어도 위양성으로 조기 종료되지 않도록 함
// (내용 누출 방지).
// lowerHtml은 stripTagBlock에서 문서 전체를 단 한 번만 소문자화해 넘겨받은 것 — 매 호출마다
// 재계산하지 않고, fromIndex도 매번 이전 탐색 지점 이후로만 전진하므로(뒤로 재탐색 없음)
// stripTagBlock 전체 호출에 걸친 누적 비용이 문서 길이에 비례하는 선형(O(n))으로 유지된다.
function findClosingTagIndex(
  lowerHtml: string,
  tagName: string,
  fromIndex: number,
): { closeStart: number; closeEnd: number } | null {
  const needle = `</${tagName}`
  let searchFrom = fromIndex
  for (;;) {
    const idx = lowerHtml.indexOf(needle, searchFrom)
    if (idx === -1) return null
    if (isTagBoundaryChar(lowerHtml[idx + needle.length])) {
      const tagEnd = lowerHtml.indexOf('>', idx)
      return { closeStart: idx, closeEnd: tagEnd === -1 ? lowerHtml.length : tagEnd }
    }
    searchFrom = idx + needle.length // 위양성(예: </scriptFOO>) — 계속 다음 위치부터 탐색
  }
}

// title/script/style처럼 "여는 태그 ~ 닫는 태그" 사이 내용을 통째로 제거할 때 쓰는 태그.
// 정규식 lazy quantifier([\s\S]*?) 대신 indexOf 기반 수동 스캔을 사용 — 백트래킹 자체가 없어
// 태그 content 길이에 무관하게(2KB 넘는 실제 JSON-LD/GTM 스니펫 등) ReDoS 없이 안전하게 처리.
// html 전체를 한 번만 toLowerCase()하고(반복 호출 금지 — 매 반복마다 남은 문자열을 다시
// 소문자화하면 태그 개수에 비례해 실질 O(n²)가 됨, 800KB 유튜브 채널 캡 케이스에서 실측됨),
// 원본 문자열은 결과 조립(slice)에만 쓰고 탐색은 전부 인덱스 기반으로 lowerHtml 위에서 수행한다.
function stripTagBlock(html: string, tagName: string): string {
  const lowerHtml = html.toLowerCase()

  let result = ''
  let cursor = 0
  for (;;) {
    const openTag = findOpenTagIndex(lowerHtml, tagName, cursor)
    if (!openTag) {
      result += html.slice(cursor)
      break
    }
    result += html.slice(cursor, openTag.start)

    const closeTag = findClosingTagIndex(lowerHtml, tagName, openTag.end)
    if (!closeTag) {
      // 닫는 태그가 끝까지 없음 — 이후 내용을 전부 버림(스크립트/스타일 원문 누출 방지).
      break
    }
    cursor = closeTag.closeEnd === lowerHtml.length ? lowerHtml.length : closeTag.closeEnd + 1
  }
  return result
}

// 임베딩 입력용 "본문 텍스트" 추출 — <title>/<script>/<style> 제외한 나머지 텍스트.
// 익스텐션의 document.body.innerText와 동등한 신호를 서버에서 재현(fetchMeta만 있는 경로 보강).
function extractBodyText(html: string): string {
  const withoutTitle = stripTagBlock(html, 'title')
  const withoutScript = stripTagBlock(withoutTitle, 'script')
  const stripped = stripTagBlock(withoutScript, 'style')

  const text = stripped
    .replace(/<[^<>]{0,2000}>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return decodeHtmlEntities(text)
}

// 익스텐션(extension/background/index.js)과 동일 공식 — description + body 결합 후 2000자 상한.
function buildContent(description: string, bodyText: string): string {
  return [description, bodyText].filter(Boolean).join('\n').slice(0, MAX_CONTENT_LENGTH)
}

export async function fetchMeta(url: string): Promise<{
  title: string
  description: string
  thumbnailUrl: string
  content: string
}> {
  // YouTube 영상: oEmbed 우선 (HTML 파싱보다 안정적). 채널 URL이면 null → HTML 폴백.
  if (isYouTube(url)) {
    const oembed = await fetchYouTubeOEmbed(url)
    // oEmbed는 body HTML이 없음 — description(채널명)을 content로 대체해 임베딩 품질 유지.
    if (oembed) return { ...oembed, content: oembed.description }
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BookmarkBot/1.0)' },
    })
    if (!res.ok) return { title: '', description: '', thumbnailUrl: '', content: '' }

    // 유튜브 채널 메인은 head가 커서 캡 상향 (og:title이 50KB 밖)
    const cap = isYouTubeChannel(url) ? CHANNEL_MAX_HTML : MAX_HTML
    const html = (await res.text()).slice(0, cap)

    // <title> 우선, 없으면 og:title → twitter:title
    const rawTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim()
    const title = rawTitle
      ? decodeHtmlEntities(rawTitle)
      : extractMetaContent(
          html,
          /<meta[^>]+property=["']og:title["'][^>]*>/i,
          /<meta[^>]+name=["']twitter:title["'][^>]*>/i,
        )

    // og:description → meta[name=description] → twitter:description
    const description = extractMetaContent(
      html,
      /<meta[^>]+property=["']og:description["'][^>]*>/i,
      /<meta[^>]+name=["']description["'][^>]*>/i,
      /<meta[^>]+name=["']twitter:description["'][^>]*>/i,
    )

    // og:image → twitter:image
    const rawThumbnail = extractMetaContent(
      html,
      /<meta[^>]+property=["']og:image["'][^>]*>/i,
      /<meta[^>]+name=["']twitter:image["'][^>]*>/i,
    )
    const thumbnailUrl = resolveImageUrl(rawThumbnail, url)

    const content = buildContent(description, extractBodyText(html))

    return { title, description, thumbnailUrl, content }
  } catch {
    return { title: '', description: '', thumbnailUrl: '', content: '' }
  }
}
