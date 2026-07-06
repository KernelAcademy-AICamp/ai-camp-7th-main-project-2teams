import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { searchSchema } from '@/lib/schemas'
import { createEmbedding } from '@/lib/ai'

// 자연어 하이브리드 검색. match_bookmarks RPC가 벡터(cosine) + 트라이그램(pg_trgm) 유사도를
// RRF로 병합 — 순수 벡터 검색의 정확 단어 매칭 취약점 보강(A54).
// RPC가 embedding 컬럼을 반환하지 않음 — 응답 누출 방지.
export const POST = withAuth(async (req, { user, supabase }) => {
  const parsed = searchSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const queryEmbedding = await createEmbedding(parsed.data.query)

  // SEARCH_MATCH_THRESHOLD: 운영 데이터로 튜닝 가능. 기본 0.3 — 실험적 기준치, recall@k 측정 전 보수적 기본값.
  // (text-embedding-3-small 비대칭: 저장 doc=title+content 長 vs 쿼리=短 → cosine 낮게 나옴)
  const raw = parseFloat(process.env.SEARCH_MATCH_THRESHOLD ?? '0.3')
  const threshold = Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : 0.3

  const { data, error } = await supabase.rpc('match_bookmarks', {
    query_embedding: queryEmbedding,
    query_text: parsed.data.query,
    match_threshold: threshold,
    match_count: 20,
    p_user_id: user.id,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ results: data })
})
