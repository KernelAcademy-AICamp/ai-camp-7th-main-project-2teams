// 서버사이드 전용 — 외부 URL에서 title/description 추출. content 없는 단일 북마크 추가 시 사용.

const FETCH_TIMEOUT_MS = 5000
const MAX_HTML = 50_000 // <head> 파싱에 충분, 대용량 바디 방지
// YouTube 채널 메인 페이지는 <title>/og:title이 ~630KB 지점에 있어 기본 캡으론 누락 → 상향.
const CHANNEL_MAX_HTML = 800_000

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

// 여러 meta 태그 패턴을 순서대로 시도해 첫 content 값 반환 (속성 순서 무관 추출).
function extractMetaContent(html: string, ...patterns: RegExp[]): string {
  for (const tagRe of patterns) {
    const tag = html.match(tagRe)?.[0]
    const content = tag?.match(/content=["']([^"']{1,1000})["']/i)?.[1]?.trim()
    if (content) return content
  }
  return ''
}

export async function fetchMeta(
  url: string,
): Promise<{ title: string; description: string; thumbnailUrl: string }> {
  // YouTube 영상: oEmbed 우선 (HTML 파싱보다 안정적). 채널 URL이면 null → HTML 폴백.
  if (isYouTube(url)) {
    const oembed = await fetchYouTubeOEmbed(url)
    if (oembed) return oembed
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BookmarkBot/1.0)' },
    })
    if (!res.ok) return { title: '', description: '', thumbnailUrl: '' }

    // 유튜브 채널 메인은 head가 커서 캡 상향 (og:title이 50KB 밖)
    const cap = isYouTubeChannel(url) ? CHANNEL_MAX_HTML : MAX_HTML
    const html = (await res.text()).slice(0, cap)

    // <title> 우선, 없으면 og:title → twitter:title
    const title =
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
      extractMetaContent(
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

    return { title, description, thumbnailUrl }
  } catch {
    return { title: '', description: '', thumbnailUrl: '' }
  }
}
