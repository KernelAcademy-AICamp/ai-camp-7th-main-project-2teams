// 서버사이드 전용 — 외부 URL에서 title/description 추출. content 없는 단일 북마크 추가 시 사용.
export async function fetchMeta(url: string): Promise<{ title: string; description: string }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BookmarkBot/1.0)' },
    })
    if (!res.ok) return { title: '', description: '' }

    const text = await res.text()
    const html = text.slice(0, 50_000) // <head> 파싱에 충분, 대용량 바디 방지

    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? ''

    // og:description 또는 meta[name=description] — 속성 순서 무관하게 태그 전체 추출 후 content 파싱
    const ogTag = html.match(/<meta[^>]+property=["']og:description["'][^>]*>/i)?.[0]
    const metaTag = html.match(/<meta[^>]+name=["']description["'][^>]*>/i)?.[0]
    const description =
      (ogTag ?? metaTag)?.match(/content=["']([^"']{1,1000})["']/i)?.[1]?.trim() ?? ''

    return { title, description }
  } catch {
    return { title: '', description: '' }
  }
}
