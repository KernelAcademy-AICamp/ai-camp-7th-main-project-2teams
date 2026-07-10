import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth'
import { fetchMeta, isDeadStatus } from '@/lib/fetchMeta'

const idSchema = z.string().uuid()

// POST: 죽은 링크 배지의 "지금 다시 확인" 액션 — 저장된 URL을 재요청해 is_dead 갱신.
// PATCH([id]/route.ts)와 분리한 이유: 외부 fetch(수 초 소요)를 유발하는 유일한 액션이라
// 즐겨찾기·태그 등 순수 DB 쓰기인 PATCH와 책임을 나눔. bookmarkUpdateSchema에도 is_dead 없음.
export const POST = withAuth<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const { id } = await ctx.params
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const { data: bookmark, error: fetchError } = await ctx.supabase
    .from('bookmarks')
    .select('id, url')
    .eq('id', id)
    .eq('user_id', ctx.user.id)
    .maybeSingle()

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }
  if (!bookmark) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const meta = await fetchMeta(bookmark.url)
  const is_dead = isDeadStatus(meta.httpStatus)

  const { data, error } = await ctx.supabase
    .from('bookmarks')
    .update({ is_dead })
    .eq('id', id)
    .eq('user_id', ctx.user.id)
    .select('id, is_dead')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ bookmark: data })
})
