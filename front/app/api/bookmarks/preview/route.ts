import { withAuth } from '@/lib/auth'
import { fetchMeta, isDeadStatus } from '@/lib/fetchMeta'
import { isSafeHttpUrl } from '@/lib/ssrf'
import { z } from 'zod'

const schema = z.object({ url: z.string().url() })

// 북마크 추가 전 URL 미리보기 — 외부 페이지 title/description/썸네일만 반환 (content 미저장·미반환)
export const GET = withAuth(async (req) => {
  const raw = new URL(req.url).searchParams.get('url') ?? ''
  const parsed = schema.safeParse({ url: raw })
  if (!parsed.success) {
    return Response.json({ error: '올바른 URL이 아닙니다.' }, { status: 400 })
  }

  if (!isSafeHttpUrl(parsed.data.url)) {
    return Response.json({ error: '접근할 수 없는 호스트입니다.' }, { status: 400 })
  }

  const meta = await fetchMeta(parsed.data.url)
  return Response.json({
    title: meta.title,
    description: meta.description,
    thumbnailUrl: meta.thumbnailUrl,
    dead: isDeadStatus(meta.httpStatus),
  })
})
