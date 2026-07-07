import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth'
import { bookmarkCreateSchema } from '@/lib/schemas'
import { generateTags, createEmbedding } from '@/lib/ai'
import { normalizeTags, extractTopCategory, UNCATEGORIZED_LABEL } from '@/lib/tag-alias'
import { logger } from '@/lib/logger'
import { fetchMeta } from '@/lib/fetchMeta'
import { isSafeHttpUrl } from '@/lib/ssrf'
import { normalizeUrl } from '@/lib/normalizeUrl'

const getQuerySchema = z.object({
  tab: z.string().optional(),
  category: z.string().optional(),
  tag: z.string().optional(),
  folder: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

// 저장 + AI 태깅 + 임베딩. content(본문)는 DB 저장·로그 금지 — 임베딩 계산 후 즉시 파기.
// description(og:description)은 기본 저장(카드 표시·검색용) — content와는 별개 값.
// maskSensitive() 경유 필수 (lib/logger.ts), 응답에 embedding 미포함.
export const POST = withAuth(async (req, { user, supabase }) => {
  const parsed = bookmarkCreateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  let { title, content } = parsed.data
  const { folder_hint } = parsed.data
  // 중복 방지: 정규화된 canonical URL로 저장 (trailing slash·fragment·트래킹파라미터 흡수)
  const url = normalizeUrl(parsed.data.url)

  // 중복 선검사 — 이미 저장된 URL이면 409 (AI 호출 전이라 비용 절약).
  // 조용한 덮어쓰기 대신 명시적 안내. 경합은 아래 insert의 unique 위반(23505)으로 이중 방어.
  const { data: existing } = await supabase
    .from('bookmarks')
    .select('id')
    .eq('user_id', user.id)
    .eq('url', url)
    .maybeSingle()
  if (existing) {
    return NextResponse.json(
      { error: '이미 저장된 북마크입니다.', duplicate: true },
      { status: 409 },
    )
  }

  // description·thumbnail_url은 content 유무와 무관하게 항상 필요 → fetchMeta 항상 호출
  // (기존: content 있으면 스킵 → thumbnail_url이 익스텐션 경로에서 항상 null이었던 버그 수정).
  // title은 익스텐션이 이미 캡처했으면(content 있으면) document.title을 더 신뢰 — meta.title로 덮지 않음.
  const hasExtensionContent = content.trim() !== ''
  const meta = await fetchMeta(url)
  if (!hasExtensionContent && meta.title) title = meta.title
  const description = meta.description || null
  const thumbnailUrl = isSafeHttpUrl(meta.thumbnailUrl) ? meta.thumbnailUrl : null
  // 임베딩 입력 — 익스텐션 content(og:description+body, 2000자 상한) 우선, 없으면 서버 추출본으로 대체.
  const embeddingContent = hasExtensionContent ? content : meta.content

  // A37: PDF·chrome:// 등 content script 차단 + 서버 추출도 실패 → embedding=title만(약한 벡터). 허용 degradation.
  const hasContent = embeddingContent.trim() !== ''
  if (!hasContent) logger.warn('[weak-vector]', { url, title, user_id: user.id, reason: 'content 없음 — title 전용 임베딩' })

  // 태깅 + 임베딩 병렬 실행 → 응답시간 단축. embeddingContent는 이 스코프 안에서만 사용 후 파기.
  const [tagsResult, embeddingResult] = await Promise.allSettled([
    generateTags({ title, url, description: embeddingContent }),
    createEmbedding(hasContent ? `${title}\n${embeddingContent}` : title),
  ])

  // 임베딩 실패 = 검색 불가 → 검색 못 하는 북마크 저장 안 함(502).
  if (embeddingResult.status === 'rejected') {
    return NextResponse.json({ error: '임베딩 생성 실패' }, { status: 502 })
  }
  const embedding = embeddingResult.value
  // 태깅 실패는 빈 태그로 degrade — 저장 자체는 진행.
  const rawTags = tagsResult.status === 'fulfilled' ? tagsResult.value : []

  // 대분류 추출 + 제거 → tags는 중·소분류 전용. 대분류명이 중간 위치여도 정확히 분리됨.
  const { category: top, midTags: tags } = extractTopCategory(normalizeTags(rawTags))
  let category_id: string | null = null
  if (top) {
    const { data: category } = await supabase
      .from('categories')
      .upsert({ name: top, user_id: user.id }, { onConflict: 'user_id,name' })
      .select('id')
      .single()
    category_id = category?.id ?? null
  }

  const { data, error } = await supabase
    .from('bookmarks')
    .insert({
      user_id: user.id,
      title,
      url,
      description,
      tags,
      category_id,
      folder_hint: folder_hint ?? null,
      thumbnail_url: thumbnailUrl,
      embedding,
    })
    // 명시 컬럼 — embedding 누출 방지
    .select(
      'id, url, title, tags, category_id, folder_hint, is_favorite, thumbnail_url, created_at',
    )
    .single()

  if (error) {
    // 경합: 선검사 통과 후 동시 insert로 (user_id, url) unique 위반 → 중복 취급
    if (error.code === '23505') {
      return NextResponse.json(
        { error: '이미 저장된 북마크입니다.', duplicate: true },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ bookmark: data }, { status: 201 })
})

// 목록 조회 + 필터. RLS로 본인 데이터만. embedding 컬럼 제외.
// A60: description 포함 — 카드 수정 모달에서 기존 설명 프리필용.
// category:categories(name) — 카드 수정 모달에서 현재 카테고리 default 선택용 (category_id → 이름 조인).
const LIST_COLUMNS =
  'id, url, title, description, tags, category_id, category:categories(name), folder_hint, is_favorite, thumbnail_url, created_at'

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
  // '미분류'는 category_id IS NULL 조회 (고정 12개 외·태깅 실패분)
  let categoryId: string | null = null
  let uncategorized = false
  if (category === UNCATEGORIZED_LABEL) {
    uncategorized = true
  } else if (category) {
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
  if (uncategorized) query = query.is('category_id', null)
  else if (categoryId) query = query.eq('category_id', categoryId)
  if (tag) query = query.contains('tags', [tag])
  if (folder) query = query.contains('folder_hint', [folder])

  const { data, error, count } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Supabase 임베드는 category: { name } 중첩 객체로 반환 → 평탄화해 category: string | null로 노출
  const bookmarks = (data ?? []).map((b) => {
    const { category, ...rest } = b as typeof b & { category: { name: string } | null }
    return { ...rest, category: category?.name ?? null }
  })

  return NextResponse.json({ bookmarks, total: count ?? 0 })
})
