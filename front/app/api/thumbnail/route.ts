import { withAuth } from '@/lib/auth'
import { isSafeHttpUrl } from '@/lib/ssrf'
import { z } from 'zod'

const querySchema = z.object({ id: z.string().uuid() })

const FETCH_TIMEOUT_MS = 5000
const MAX_BYTES = 5 * 1024 * 1024 // og:image/썸네일 상한 — 과대 이미지로 인한 함수 메모리/시간 낭비 방지

// 캐시 프록시 방식 — 원본 이미지를 우리 DB/스토리지에 영구 저장하지 않고, 요청 시점에 fetch해
// CDN edge에서만 캐시(TTL 만료 시 재요청). 저작권 이슈를 줄이는 핫링크에 가까운 처리.
const CACHE_CONTROL = 'public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400'

// 북마크 카드 썸네일 프록시 — id로 소유 북마크의 thumbnail_url을 조회 후 대신 fetch해 스트리밍.
// 클라이언트가 임의 URL을 직접 넘기지 못하게 해 오픈 프록시(SSRF/DoS 릴레이) 악용을 차단.
export const GET = withAuth(async (req, { user, supabase }) => {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) {
    return new Response(null, { status: 400 })
  }

  const { data: bookmark } = await supabase
    .from('bookmarks')
    .select('thumbnail_url')
    .eq('id', parsed.data.id)
    .eq('user_id', user.id)
    .maybeSingle()

  const thumbnailUrl = bookmark?.thumbnail_url
  if (!thumbnailUrl || !isSafeHttpUrl(thumbnailUrl)) {
    return new Response(null, { status: 404 })
  }

  let upstream: Response
  try {
    upstream = await fetch(thumbnailUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BookmarkBot/1.0)' },
    })
  } catch {
    return new Response(null, { status: 502 })
  }

  const contentType = upstream.headers.get('content-type') ?? ''
  if (!upstream.ok || !contentType.startsWith('image/')) {
    return new Response(null, { status: 502 })
  }

  const buffer = await upstream.arrayBuffer()
  if (buffer.byteLength > MAX_BYTES) {
    return new Response(null, { status: 502 })
  }

  return new Response(buffer, {
    headers: { 'Content-Type': contentType, 'Cache-Control': CACHE_CONTROL },
  })
})
