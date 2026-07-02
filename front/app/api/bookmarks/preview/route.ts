import { withAuth } from '@/lib/auth'
import { fetchMeta } from '@/lib/fetchMeta'
import { z } from 'zod'

const schema = z.object({ url: z.string().url() })

// 내부망 SSRF 차단 — 사설/루프백 호스트 거부 (임의 URL 서버 fetch)
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h === '0.0.0.0' || h === '::1') return true
  if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  // IPv6 link-local(fe80::/10) · unique-local(fc00::/7)
  if (/^fe[89ab][0-9a-f]:/i.test(h) || /^f[cd][0-9a-f]{2}:/i.test(h)) return true
  return false
}

// 북마크 추가 전 URL 미리보기 — 외부 페이지 title/description만 반환 (content 미저장·미반환)
export const GET = withAuth(async (req) => {
  const raw = new URL(req.url).searchParams.get('url') ?? ''
  const parsed = schema.safeParse({ url: raw })
  if (!parsed.success) {
    return Response.json({ error: '올바른 URL이 아닙니다.' }, { status: 400 })
  }

  let hostname: string
  try {
    const u = new URL(parsed.data.url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return Response.json({ error: '허용되지 않는 프로토콜입니다.' }, { status: 400 })
    }
    hostname = u.hostname
  } catch {
    return Response.json({ error: '올바른 URL이 아닙니다.' }, { status: 400 })
  }

  if (isBlockedHost(hostname)) {
    return Response.json({ error: '접근할 수 없는 호스트입니다.' }, { status: 400 })
  }

  const meta = await fetchMeta(parsed.data.url)
  return Response.json({ title: meta.title, description: meta.description })
})
