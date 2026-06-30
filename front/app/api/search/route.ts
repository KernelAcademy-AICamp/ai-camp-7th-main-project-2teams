import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { searchSchema } from '@/lib/schemas'
import { createEmbedding } from '@/lib/ai'

// 자연어 벡터 검색. 쿼리를 임베딩 변환 후 match_bookmarks RPC(cosine 유사도).
// RPC가 embedding 컬럼을 반환하지 않음 — 응답 누출 방지.
export const POST = withAuth(async (req, { user, supabase }) => {
  const parsed = searchSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // bge-m3 비대칭 — 쿼리는 input_type='query'로 임베딩 (저장 doc은 'passage')
  const queryEmbedding = await createEmbedding(parsed.data.query, 'query')

  // SEARCH_MATCH_THRESHOLD: 운영 데이터로 튜닝 가능. 기본 0.3 — 실험적 기준치, recall@k 측정 전 보수적 기본값.
  // (bge-m3 query/passage 비대칭 임베딩 — 모델 교체 후 임계값 재튜닝 권장)
  const raw = parseFloat(process.env.SEARCH_MATCH_THRESHOLD ?? '0.3')
  const threshold = Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : 0.3

  const { data, error } = await supabase.rpc('match_bookmarks', {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: 20,
    p_user_id: user.id,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ results: data })
})
