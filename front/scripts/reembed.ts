// 전체 북마크 재임베딩 — 임베딩 모델 전환(3-small → 3-large, lib/ai.ts EMBEDDING_MODEL) 반영.
// 실행: source .env 후 `npx tsx scripts/reembed.ts`
// 모델 간 벡터 공간 비호환 → 모델 변경 시 전량 재생성 필수(검색 쿼리 임베딩과 좌표계 일치).
// 입력 규약: title + description + 태그(A/B 측정과 동일 조합). description 없으면 weak 경로
// (title + LLM 한줄요약 + 태그, app/api/bookmarks/route.ts weak 경로와 동일 규약).
// 백업 없음 — 임베딩은 원본(title·description·tags)에서 언제든 재생성 가능. 롤백 = 구 모델로 재실행.
// 환경변수:
//   DRY=1            쓰기 없이 대상 집계만 출력
//   REEMBED_LIMIT=N  앞 N개만 처리(0=전체)
import { createClient } from '@supabase/supabase-js'
import { createEmbedding, generateWeakSummary, buildWeakEmbeddingText, EMBEDDING_MODEL } from '../lib/ai'

const DRY = process.env.DRY === '1'
const LIMIT = Number(process.env.REEMBED_LIMIT ?? '0')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

type Row = { id: string; url: string; title: string; description: string | null; tags: string[] | null }

async function main() {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('id, url, title, description, tags')
    .order('created_at', { ascending: true })
  if (error) throw error

  const rows = (LIMIT > 0 ? data!.slice(0, LIMIT) : data!) as Row[]
  const weak = rows.filter((r) => !r.description)
  console.log(`대상 ${rows.length}건 (weak: ${weak.length}) → 모델 ${EMBEDDING_MODEL}${DRY ? ' [DRY]' : ''}`)
  if (DRY) return

  let done = 0
  let failed = 0
  for (const r of rows) {
    try {
      const tagsLine = r.tags?.length ? `태그: ${r.tags.join(', ')}` : null
      const text = r.description
        ? [r.title, r.description, tagsLine].filter(Boolean).join('\n')
        : buildWeakEmbeddingText(
            r.title,
            r.tags ?? [],
            await generateWeakSummary({ title: r.title, url: r.url }),
          )
      const embedding = await createEmbedding(text)
      const { error: upErr } = await supabase.from('bookmarks').update({ embedding }).eq('id', r.id)
      if (upErr) throw new Error(upErr.message)
      done++
    } catch (e) {
      failed++
      console.error('실패:', r.id, r.url, e instanceof Error ? e.message : e)
    }
    if ((done + failed) % 100 === 0) console.log(`진행 ${done + failed}/${rows.length} (실패 ${failed})`)
  }
  console.log(`완료: 성공 ${done} / 실패 ${failed}`)
}

main()
