import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { bookmarkCreateSchema } from '@/lib/schemas'
import { generateTags, createEmbedding } from '@/lib/ai'
import { normalizeTags, resolveTopCategory } from '@/lib/tag-alias'

// 저장 + AI 태깅 + 임베딩. content는 DB 저장·로그 금지 (A8), 응답에 embedding 미포함.
export const POST = withAuth(async (req, { user, supabase }) => {
  const parsed = bookmarkCreateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { title, url, content, folder_hint } = parsed.data

  // 태깅 + 임베딩 병렬 실행 → 응답시간 단축. content는 이 스코프 안에서만 사용 후 파기.
  const [rawTags, embedding] = await Promise.all([
    generateTags({ title, url }),
    createEmbedding(`${title}\n${content}`),
  ])

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

  const { data, error } = await supabase
    .from('bookmarks')
    .insert({
      user_id: user.id,
      title,
      url,
      tags,
      category_id,
      folder_hint: folder_hint ?? null,
      embedding,
    })
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
  const { searchParams } = new URL(req.url)
  const tab = searchParams.get('tab')
  const category = searchParams.get('category')
  const tag = searchParams.get('tag')
  const folder = searchParams.get('folder')
  const page = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 20)))
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
