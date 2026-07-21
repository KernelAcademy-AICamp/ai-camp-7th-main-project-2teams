import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth'
import { logEvent, CLIENT_LOGGABLE, type EventType } from '@/lib/events'

// 클라이언트 상호작용 이벤트 수집(현재 search_result_clicked 전용).
// 서버 전용 이벤트(bookmark_saved 등) 위조 방지 — 화이트리스트로 차단.
const bodySchema = z.object({
  type: z.enum(CLIENT_LOGGABLE as [EventType, ...EventType[]]),
  meta: z.record(z.string(), z.unknown()).optional(),
})

export const POST = withAuth(async (req, { user, supabase }) => {
  const parsed = bodySchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  await logEvent(supabase, user.id, parsed.data.type, parsed.data.meta)
  return NextResponse.json({ ok: true })
})
