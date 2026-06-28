import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth'
import { favoriteSchema } from '@/lib/schemas'

// 명시 컬럼 — embedding 누출 방지 (select('*') 금지)
const SELECT_COLUMNS =
  'id, url, title, tags, category_id, folder_hint, is_favorite, created_at'

const idSchema = z.string().uuid()

// PATCH: is_favorite 토글.
// Next.js 16에서 params는 Promise → await 필수.
// eq('user_id') 이중 필터: RLS 정책 외 명시적 안전장치.
export const PATCH = withAuth<{ params: Promise<{ id: string }> }>(
  async (req, ctx) => {
    const { id } = await ctx.params
    // id 형식 검증 — 비정상 입력 시 DB 왕복·모호한 500 대신 400
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const parsed = favoriteSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const { is_favorite } = parsed.data

    const { data, error } = await ctx.supabase
      .from('bookmarks')
      .update({ is_favorite })
      .eq('id', id)
      .eq('user_id', ctx.user.id)
      .select(SELECT_COLUMNS)
      .single()

    if (error) {
      // PGRST116: 단건 조회 결과 없음 — 존재하지 않거나 타인 북마크
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ bookmark: data })
  },
)

// DELETE: 본인 북마크 단건 삭제.
// count:'exact'로 삭제 행 수 확인 — 0행(미존재·타인)이면 404로 명확히 구분.
export const DELETE = withAuth<{ params: Promise<{ id: string }> }>(
  async (_req, ctx) => {
    const { id } = await ctx.params
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const { error, count } = await ctx.supabase
      .from('bookmarks')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('user_id', ctx.user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (count === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  },
)
