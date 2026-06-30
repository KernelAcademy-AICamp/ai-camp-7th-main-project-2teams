// 서버사이드 전용 — 외부 URL에서 title/description 추출. content 없는 단일 북마크 추가 시 사용.

const FETCH_TIMEOUT_MS = 5000
const MAX_HTML = 50_000 // <head> 파싱에 충분, 대용량 바디 방지

function isYouTube(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return /(^|\.)youtube\.com$/.test(host) || host === 'youtu.be'
  } catch {
    return false
  }
}

// YouTube는 봇 UA에 동의 페이지를 주거나 SSR title이 없어 HTML 파싱이 불안정 →
// oEmbed(공개 API, 키 불필요)로 영상 제목 + 채널명 확보. 채널 URL은 oEmbed 404 → null로 폴백(HTML 시도).
async function fetchYouTubeOEmbed(
  url: string,
): Promise<{ title: string; description: string } | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    )
    if (!res.ok) return null
    const data = (await res.json()) as { title?: string; author_name?: string }
    if (!data.title) return null
    return {
      title: data.title,
      description: data.author_name ? `${data.author_name} 채널` : '',
    }
  } catch {
    return null
  }
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

export async function fetchMeta(url: string): Promise<{ title: string; description: string }> {
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
    if (!res.ok) return { title: '', description: '' }

    const html = (await res.text()).slice(0, MAX_HTML)

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

    return { title, description }
  } catch {
    return { title: '', description: '' }
  }
}
