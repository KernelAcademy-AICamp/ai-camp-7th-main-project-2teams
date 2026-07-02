// 전체 북마크 재태깅 — 개선된 SYSTEM_PROMPT(lib/ai.ts) 기준으로 tags 갱신.
// 실행: source .env 후 `npx tsx scripts/retag.ts`
// 환경변수:
//   DRY=1          쓰기 없이 예측만 출력(카나리)
//   RETAG_LIMIT=N  앞 N개만 처리(0=전체)
//   CONCURRENCY=N  동시 OpenAI 호출 수(기본 6)
//   KEEP_NONEMPTY=1 새 태그가 빈 배열이고 기존 태그가 있으면 스킵(순손실 방지).
//                   content 없이 재태깅 시 저품질 title이 태그를 통째로 날리는 것 방지 — docs/specs/tag-eval-redesign.md §B-2.
// 롤백: bookmarks_tags_backup_20260701 테이블에서 복원.
import { createClient } from '@supabase/supabase-js'
import { generateTags } from '../lib/ai'

const DRY = process.env.DRY === '1'
const LIMIT = Number(process.env.RETAG_LIMIT ?? '0')
const CONCURRENCY = Number(process.env.CONCURRENCY ?? '6')
const KEEP_NONEMPTY = process.env.KEEP_NONEMPTY === '1'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

type Row = { id: string; url: string; title: string; tags: string[] }

const eq = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i])

// Supabase JS는 쿼리당 최대 1000행 → range로 페이지네이션
async function fetchAll(): Promise<Row[]> {
  const PAGE = 1000
  const all: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('bookmarks')
      .select('id, url, title, tags')
      .order('created_at')
      .range(from, from + PAGE - 1)
    if (error) throw error
    all.push(...(data as Row[]))
    if (!data || data.length < PAGE) break
  }
  return all
}

// TPM(200k/분) 스로틀 — 요청 시작 간 최소 간격 확보(~85 req/min)
const MIN_INTERVAL_MS = Number(process.env.MIN_INTERVAL_MS ?? '700')
let nextSlot = 0
async function rateGate() {
  const now = Date.now()
  const wait = Math.max(0, nextSlot - now)
  nextSlot = Math.max(now, nextSlot) + MIN_INTERVAL_MS
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
}

async function main() {
  const all = await fetchAll()
  const rows = LIMIT > 0 ? all.slice(0, LIMIT) : all
  console.log(`[retag] 대상 ${rows.length}개 · DRY=${DRY} · 동시성=${CONCURRENCY}`)

  let processed = 0
  let changed = 0
  let failed = 0
  let kept = 0

  // 고정 워커 풀 — 인덱스를 원자적으로 소비
  let cursor = 0
  async function worker() {
    while (cursor < rows.length) {
      const row = rows[cursor++]
      try {
        await rateGate()
        const next = await generateTags({ title: row.title, url: row.url })
        // KEEP_NONEMPTY: 새 태그가 비었고 기존 태그가 있으면 순손실 → 스킵(기존 유지)
        if (KEEP_NONEMPTY && next.length === 0 && (row.tags?.length ?? 0) > 0) {
          kept++
          console.log(`= 유지 [${row.tags.join(',')}] (새 태그 빈값) | ${row.title}`)
          processed++
          continue
        }
        const isDiff = !eq(row.tags ?? [], next)
        if (isDiff) {
          changed++
          console.log(`~ [${row.tags?.join(',') ?? ''}] → [${next.join(',')}] | ${row.title}`)
          if (!DRY) {
            const { error: upErr } = await supabase
              .from('bookmarks')
              .update({ tags: next })
              .eq('id', row.id)
            if (upErr) throw upErr
          }
        }
      } catch (e) {
        failed++
        console.error(`! 실패 id=${row.id} | ${row.title} | ${(e as Error).message}`)
      }
      processed++
      if (processed % 50 === 0) console.log(`[진행] ${processed}/${rows.length} (변경 ${changed}, 실패 ${failed})`)
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  const keptMsg = KEEP_NONEMPTY ? ` · 유지 ${kept}` : ''
  console.log(`[완료] 처리 ${processed} · 변경 ${changed}${keptMsg} · 실패 ${failed}${DRY ? ' · (DRY: 미반영)' : ''}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
