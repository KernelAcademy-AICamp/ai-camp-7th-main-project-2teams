// 전체 북마크 재태깅 — 개선된 SYSTEM_PROMPT(lib/ai.ts) 기준으로 tags 갱신.
// 실행: source .env 후 `npx tsx scripts/retag.ts`
// 환경변수:
//   DRY=1          쓰기 없이 예측만 출력(카나리)
//   RETAG_LIMIT=N  앞 N개만 처리(0=전체)
//   CONCURRENCY=N  동시 OpenAI 호출 수(기본 6)
//   KEEP_NONEMPTY=1 새 태그가 빈 배열이고 기존 태그가 있으면 스킵(순손실 방지).
//                   content 없이 재태깅 시 저품질 title이 태그를 통째로 날리는 것 방지 — docs/specs/tag-eval-redesign.md §B-2.
//   RESTORE=<path> 백업 파일에서 tags 복원 후 종료(재태깅 안 함). 아래 자동 백업의 역연산.
// 자동 백업(B-1, docs/specs/tag-eval-redesign.md §B-1):
//   비-DRY 실행 시 쓰기 전 전체 (id, tags) 스냅샷을 scripts/backups/에 저장. 백업 실패면 쓰기 중단.
//   롤백: `RESTORE=scripts/backups/<파일> npx tsx scripts/retag.ts`.
//   ※ 파일에 user 데이터(id·tags) 포함 → scripts/backups/ 는 .gitignore. 커밋 금지.
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { generateTags } from '../lib/ai'
import { serializeBackup, parseBackup, type TagSnapshot } from './retag-backup'

const DRY = process.env.DRY === '1'
const LIMIT = Number(process.env.RETAG_LIMIT ?? '0')
const CONCURRENCY = Number(process.env.CONCURRENCY ?? '6')
const KEEP_NONEMPTY = process.env.KEEP_NONEMPTY === '1'
const RESTORE = process.env.RESTORE ?? ''

const BACKUP_DIR = join(__dirname, 'backups')

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

// 쓰기 전 전체 스냅샷을 타임스탬프 파일로 저장. 경로 반환. 실패 시 throw → 호출부에서 쓰기 중단.
function backupTags(rows: Row[]): string {
  mkdirSync(BACKUP_DIR, { recursive: true })
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '') // YYYYMMDDTHHMMSS
  const path = join(BACKUP_DIR, `retag-tags-${ts}.json`)
  const snapshot: TagSnapshot[] = rows.map((r) => ({ id: r.id, tags: r.tags ?? [] }))
  writeFileSync(path, serializeBackup(snapshot))
  return path
}

// 백업 파일의 tags로 되돌림. 자동 백업의 역연산. 재태깅/OpenAI 미호출.
async function restoreFromBackup(path: string): Promise<void> {
  const snapshot = parseBackup(readFileSync(path, 'utf-8'))
  console.log(`[restore] ${snapshot.length}개 복원 · ${path} · DRY=${DRY}`)
  let restored = 0
  let failed = 0
  for (const { id, tags } of snapshot) {
    if (DRY) continue
    const { error } = await supabase.from('bookmarks').update({ tags }).eq('id', id)
    if (error) {
      failed++
      console.error(`! 복원 실패 id=${id} | ${error.message}`)
    } else {
      restored++
    }
  }
  console.log(`[restore 완료] 복원 ${restored} · 실패 ${failed}${DRY ? ' · (DRY: 미반영)' : ''}`)
}

async function main() {
  // 복원 모드 — 재태깅 대신 백업에서 되돌리고 종료
  if (RESTORE) {
    await restoreFromBackup(RESTORE)
    return
  }

  const all = await fetchAll()
  const rows = LIMIT > 0 ? all.slice(0, LIMIT) : all
  console.log(`[retag] 대상 ${rows.length}개 · DRY=${DRY} · 동시성=${CONCURRENCY}`)

  // B-1: 쓰기 전 자동 백업. 백업 실패면 재태깅 중단(순손실 방지). DRY는 쓰기 없으므로 생략.
  if (!DRY) {
    const backupPath = backupTags(all) // LIMIT 무관 전체 스냅샷 — 부분 실행도 전량 복원 가능
    console.log(`[backup] ${all.length}개 스냅샷 저장 · ${backupPath}`)
  }

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
