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

  const queryEmbedding = await createEmbedding(parsed.data.query)

  const { data, error } = await supabase.rpc('match_bookmarks', {
    query_embedding: queryEmbedding,
    match_threshold: 0.5,
    match_count: 20,
    p_user_id: user.id,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ results: data })
})
