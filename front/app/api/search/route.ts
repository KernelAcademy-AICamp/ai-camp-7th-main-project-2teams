import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { searchSchema } from '@/lib/schemas'
import { createEmbedding } from '@/lib/ai'
import { UNCATEGORIZED_LABEL } from '@/lib/tag-alias'
import { expandSearchQuery } from '@/lib/search-alias'

type SearchRow = Record<string, unknown> & { id: string; similarity: number }

// 자연어 하이브리드 검색. match_bookmarks RPC가 벡터(cosine) + 트라이그램(pg_trgm) 유사도를
// RRF로 병합 — 순수 벡터 검색의 정확 단어 매칭 취약점 보강(A54).
// RPC가 embedding 컬럼을 반환하지 않음 — 응답 누출 방지.
// 절대 코사인 threshold는 사용하지 않음 — 무관 문서끼리도 baseline 코사인이 0.3~0.48대라
// 임계값으로 노이즈를 못 거름. top-K 랭킹 + 이번 검색 최고점 대비 상대 gap + 절대 floor로 병합(RPC 내부, A55 후속).
export const POST = withAuth(async (req, { user, supabase }) => {
  const parsed = searchSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // 현재 선택된 카테고리 안에서만 검색 (A55). GET /api/bookmarks와 동일한 이름→id 해석.
  let categoryId: string | null = null
  let uncategorized = false
  if (parsed.data.category === UNCATEGORIZED_LABEL) {
    uncategorized = true
  } else if (parsed.data.category) {
    const { data: cat } = await supabase
      .from('categories')
      .select('id')
      .eq('name', parsed.data.category)
      .single()
    if (!cat) return NextResponse.json({ results: [] })
    categoryId = cat.id
  }

  // A58: 사이드바 태그/즐겨찾기 필터를 검색에도 적용. 미지정 시 null → 기존 전체 검색과 동일.
  const tags = parsed.data.tag ? [parsed.data.tag] : null
  const isFavorite = parsed.data.is_favorite ?? null

  // 한/영 브랜드명 음차 교차검색 (예: 피그마 ↔ Figma) — 임베딩 모델이 못 잡는 교차언어 매칭 보강.
  const queries = expandSearchQuery(parsed.data.query)

  const rpcResults = await Promise.all(
    queries.map(async (q) => {
      const embedding = await createEmbedding(q)
      return supabase.rpc('match_bookmarks', {
        query_embedding: embedding,
        query_text: q,
        match_count: 20,
        p_user_id: user.id,
        p_category_id: categoryId,
        p_uncategorized: uncategorized,
        p_tags: tags,
        p_is_favorite: isFavorite,
      })
    }),
  )

  const failed = rpcResults.find((r) => r.error)
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 })
  }

  const merged = new Map<string, SearchRow>()
  for (const { data } of rpcResults) {
    for (const row of (data ?? []) as SearchRow[]) {
      const existing = merged.get(row.id)
      if (!existing || row.similarity > existing.similarity) merged.set(row.id, row)
    }
  }

  const results = [...merged.values()].sort((a, b) => b.similarity - a.similarity).slice(0, 20)

  return NextResponse.json({ results })
})
