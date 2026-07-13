// 전체 북마크 재태깅 — 개선된 SYSTEM_PROMPT(lib/ai.ts) 기준으로 category_id·tags 갱신.
// 실행: source .env 후 `npx tsx scripts/retag.ts`
// tags는 새 분류 결과(최대 2개, schemas.ts 불변식)로 빈 슬롯만 기존 태그로 채움(mergeTags) —
// game-tag-backfill 등이 채운 특정 태그를 통째로 덮어써 유실시키지 않도록.
// ※ 백업/RESTORE는 tags만 커버 — category_id 변경은 롤백 대상 아님(TagSnapshot 포맷 미확장).
// A-2(a) 확정(docs/specs/tag-eval-redesign.md §A-2·§4): DB description 컬럼을 재크롤링 없이 그대로 태깅 입력에 포함.
// 환경변수:
//   DRY=1          쓰기 없이 예측만 출력(카나리)
//   RETAG_LIMIT=N  앞 N개만 처리(0=전체)
//   CONCURRENCY=N  동시 OpenAI 호출 수(기본 6)
//   KEEP_NONEMPTY=0 새 태그가 빈 배열이고 기존 태그가 있어도 그대로 반영(순손실 허용).
//                   기본값 true(생략 시 스킵) — content 부족 시 저품질 title이 태그를 통째로 날리는 것 방지,
//                   §4 미결 정책 확정: retag는 항상 KEEP_NONEMPTY 기본 적용.
//   RESTORE=<path> 백업 파일에서 tags 복원 후 종료(재태깅 안 함). 아래 자동 백업의 역연산.
// 자동 백업(B-1, docs/specs/tag-eval-redesign.md §B-1):
//   비-DRY 실행 시 쓰기 전 전체 (id, tags) 스냅샷을 scripts/backups/에 저장. 백업 실패면 쓰기 중단.
//   롤백: `RESTORE=scripts/backups/<파일> npx tsx scripts/retag.ts`.
//   ※ 파일에 user 데이터(id·tags) 포함 → scripts/backups/ 는 .gitignore. 커밋 금지.
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { generateTags } from '../lib/ai'
import { normalizeTags, extractTopCategory } from '../lib/tag-alias'
import { serializeBackup, parseBackup, type TagSnapshot } from './retag-backup'

const DRY = process.env.DRY === '1'
const LIMIT = Number(process.env.RETAG_LIMIT ?? '0')
const CONCURRENCY = Number(process.env.CONCURRENCY ?? '6')
const KEEP_NONEMPTY = process.env.KEEP_NONEMPTY !== '0'
const RESTORE = process.env.RESTORE ?? ''

const BACKUP_DIR = join(__dirname, 'backups')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

type Row = {
  id: string
  user_id: string
  url: string
  title: string
  tags: string[]
  description: string | null
  category_id: string | null
  category: { name: string } | null
}

const eq = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i])

// 새 분류 결과가 빈 슬롯(최대 2개, schemas.ts 불변식)을 남기면 기존 태그로 채움 —
// game-tag-backfill 등이 채운 특정 값(게임명 등)을 재태깅이 통으로 덮어써 유실시키는 것 방지.
function mergeTags(newTags: string[], oldTags: string[]): string[] {
  const merged = [...newTags]
  for (const old of oldTags) {
    if (merged.length >= 2) break
    if (!merged.includes(old)) merged.push(old)
  }
  return merged
}

const categoryCache = new Map<string, string>()
async function categoryIdFor(userId: string, name: string): Promise<string> {
  const key = `${userId}:${name}`
  const cached = categoryCache.get(key)
  if (cached) return cached
  const { data } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', userId)
    .eq('name', name)
    .maybeSingle()
  if (data) {
    categoryCache.set(key, data.id)
    return data.id
  }
  const { data: inserted, error } = await supabase
    .from('categories')
    .insert({ user_id: userId, name })
    .select('id')
    .single()
  if (error) throw error
  categoryCache.set(key, inserted.id)
  return inserted.id
}

// Supabase JS는 쿼리당 최대 1000행 → range로 페이지네이션
async function fetchAll(): Promise<Row[]> {
  const PAGE = 1000
  const all: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('bookmarks')
      .select('id, user_id, url, title, tags, description, category_id, category:categories(name)')
      .order('created_at')
      .range(from, from + PAGE - 1)
    if (error) throw error
    all.push(...(data as unknown as Row[]))
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
        const raw = await generateTags({
          title: row.title,
          url: row.url,
          description: row.description ?? undefined,
        })
        const { category: newCategory, midTags } = extractTopCategory(normalizeTags(raw))
        const oldCategory = row.category?.name ?? null

        // KEEP_NONEMPTY: 새 분류가 완전 미분류(대분류·중분류 다 없음)면 순손실 → 스킵(기존 유지)
        if (KEEP_NONEMPTY && !newCategory && midTags.length === 0 && (row.tags?.length ?? 0) > 0) {
          kept++
          console.log(`= 유지 [${row.tags.join(',')}] (새 태그 빈값) | ${row.title}`)
          processed++
          continue
        }

        const next = mergeTags(midTags, row.tags ?? [])
        const categoryDiff = newCategory !== null && newCategory !== oldCategory
        const tagsDiff = !eq(row.tags ?? [], next)
        if (categoryDiff || tagsDiff) {
          changed++
          console.log(
            `~ [${oldCategory ?? '미분류'}|${row.tags?.join(',') ?? ''}] → [${newCategory ?? oldCategory ?? '미분류'}|${next.join(',')}] | ${row.title}`,
          )
          if (!DRY) {
            const update: Record<string, unknown> = { tags: next }
            if (newCategory) update.category_id = await categoryIdFor(row.user_id, newCategory)
            const { error: upErr } = await supabase.from('bookmarks').update(update).eq('id', row.id)
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
