import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withAuth } from '@/lib/auth'
import { bookmarkUpdateSchema } from '@/lib/schemas'
import { createEmbedding } from '@/lib/ai'
import { resolveTopCategory } from '@/lib/tag-alias'
import { logger } from '@/lib/logger'

// 명시 컬럼 — embedding 누출 방지 (select('*') 금지)
const SELECT_COLUMNS =
  'id, url, title, description, tags, category_id, folder_hint, is_favorite, created_at'

const idSchema = z.string().uuid()

type CategoryResolution =
  | { ok: true; categoryId: string | null }
  | { ok: false; error: string; status: number }

// 카테고리 이름(alias 포함) → category_id 해석. POST /api/bookmarks와 동일한 upsert 패턴 — 사용자별 카테고리 재사용.
async function resolveCategoryId(
  supabase: SupabaseClient,
  userId: string,
  category: string,
): Promise<CategoryResolution> {
  const resolved = resolveTopCategory(category)
  if (!resolved) {
    return { ok: false, error: '유효하지 않은 카테고리입니다.', status: 400 }
  }

  const { data: categoryRow, error: categoryError } = await supabase
    .from('categories')
    .upsert({ name: resolved, user_id: userId }, { onConflict: 'user_id,name' })
    .select('id')
    .single()
  if (categoryError) {
    return { ok: false, error: categoryError.message, status: 500 }
  }

  return { ok: true, categoryId: categoryRow?.id ?? null }
}

// description 변경 시 title+description 재임베딩 (POST와 동일 조합) — 검색 정확도 유지 목적.
// 재임베딩 실패해도 필드 변경 자체는 이미 커밋됨 — best-effort degrade (검색 정확도만 저하).
async function reembedIfDescriptionChanged(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  bookmark: { title: string; description: string | null },
): Promise<void> {
  try {
    const text = bookmark.description
      ? `${bookmark.title}\n${bookmark.description}`
      : bookmark.title
    const embedding = await createEmbedding(text)
    const { error: embeddingError } = await supabase
      .from('bookmarks')
      .update({ embedding })
      .eq('id', id)
      .eq('user_id', userId)
    if (embeddingError) {
      logger.error('[re-embed-fail]', { id, message: embeddingError.message })
    }
  } catch (err) {
    logger.error('[re-embed-fail]', err)
  }
}

// PATCH: 즐겨찾기·태그·카테고리·설명 부분 수정 (A60).
// Next.js 16에서 params는 Promise → await 필수.
// eq('user_id') 이중 필터: RLS 정책 외 명시적 안전장치.
export const PATCH = withAuth<{ params: Promise<{ id: string }> }>(
  async (req, ctx) => {
    const { id } = await ctx.params
    // id 형식 검증 — 비정상 입력 시 DB 왕복·모호한 500 대신 400
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const parsed = bookmarkUpdateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const { is_favorite, tags, category, description } = parsed.data

    // 요청에 포함된 필드만 update payload에 반영 (부분 수정)
    const updatePayload: Record<string, unknown> = {}
    if (is_favorite !== undefined) updatePayload.is_favorite = is_favorite
    if (tags !== undefined) updatePayload.tags = tags
    if (description !== undefined) updatePayload.description = description

    if (category !== undefined) {
      if (category === null) {
        // 미분류로 변경 — 카테고리 해제
        updatePayload.category_id = null
      } else {
        const resolution = await resolveCategoryId(ctx.supabase, ctx.user.id, category)
        if (!resolution.ok) {
          return NextResponse.json({ error: resolution.error }, { status: resolution.status })
        }
        updatePayload.category_id = resolution.categoryId
      }
    }

    const { data, error } = await ctx.supabase
      .from('bookmarks')
      .update(updatePayload)
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

    if (description !== undefined) {
      await reembedIfDescriptionChanged(ctx.supabase, ctx.user.id, id, data)
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
