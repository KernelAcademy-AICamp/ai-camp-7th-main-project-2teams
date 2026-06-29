import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth'
import { bookmarkCreateSchema } from '@/lib/schemas'
import { generateTags, createEmbedding } from '@/lib/ai'
import { normalizeTags, resolveTopCategory } from '@/lib/tag-alias'

const getQuerySchema = z.object({
  tab: z.string().optional(),
  category: z.string().optional(),
  tag: z.string().optional(),
  folder: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

// 저장 + AI 태깅 + 임베딩. content는 DB 저장·로그 금지. maskSensitive() 경유 필수 (lib/logger.ts), 응답에 embedding 미포함.
export const POST = withAuth(async (req, { user, supabase }) => {
  const parsed = bookmarkCreateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { title, url, content, folder_hint } = parsed.data

  // 태깅 + 임베딩 병렬 실행 → 응답시간 단축. content는 이 스코프 안에서만 사용 후 파기.
  // description에 content 전달 → 태깅 품질 확보(익스텐션이 수집한 본문 활용).
  const [tagsResult, embeddingResult] = await Promise.allSettled([
    generateTags({ title, url, description: content }),
    createEmbedding(`${title}\n${content}`),
  ])

  // 임베딩 실패 = 검색 불가 → 검색 못 하는 북마크 저장 안 함(502).
  if (embeddingResult.status === 'rejected') {
    return NextResponse.json({ error: '임베딩 생성 실패' }, { status: 502 })
  }
  const embedding = embeddingResult.value
  // 태깅 실패는 빈 태그로 degrade — 저장 자체는 진행.
  const rawTags = tagsResult.status === 'fulfilled' ? tagsResult.value : []

  const tags = normalizeTags(rawTags)

  // tags[0]이 고정 6종 대분류면 category_id 조회, 아니면 미분류(null)
  const top = resolveTopCategory(rawTags)
  let category_id: string | null = null
  if (top) {
    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('name', top)
      .single()
    category_id = category?.id ?? null
  }

  // onConflict: (user_id, url) unique 제약 — 같은 URL 재저장 시 갱신(AI 태깅·임베딩 최신화)
  const { data, error } = await supabase
    .from('bookmarks')
    .upsert(
      {
        user_id: user.id,
        title,
        url,
        tags,
        category_id,
        folder_hint: folder_hint ?? null,
        embedding,
      },
      { onConflict: 'user_id, url', ignoreDuplicates: false },
    )
    // 명시 컬럼 — embedding 누출 방지
    .select('id, url, title, tags, category_id, folder_hint, is_favorite, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ bookmark: data }, { status: 201 })
})

// 목록 조회 + 필터. RLS로 본인 데이터만. embedding 컬럼 제외.
const LIST_COLUMNS =
  'id, url, title, tags, category_id, folder_hint, is_favorite, created_at'

export const GET = withAuth(async (req, { supabase }) => {
  const parsed = getQuerySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  )
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const { tab, category, tag, folder, page, limit } = parsed.data
  const from = (page - 1) * limit
  const to = from + limit - 1

  // category는 이름으로 전달 → category_id 해석. 없는 이름이면 빈 결과.
  let categoryId: string | null = null
  if (category) {
    const { data: cat } = await supabase
      .from('categories')
      .select('id')
      .eq('name', category)
      .single()
    if (!cat) return NextResponse.json({ bookmarks: [], total: 0 })
    categoryId = cat.id
  }

  let query = supabase
    .from('bookmarks')
    .select(LIST_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (tab === 'favorites') query = query.eq('is_favorite', true)
  if (categoryId) query = query.eq('category_id', categoryId)
  if (tag) query = query.contains('tags', [tag])
  if (folder) query = query.contains('folder_hint', [folder])

  const { data, error, count } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ bookmarks: data, total: count ?? 0 })
})
