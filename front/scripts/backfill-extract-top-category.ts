// extractTopCategory 버그 수정(resolveTopCategory→extractTopCategory) 반영 백필.
// 대상: tags 배열에 대분류명이 남아있는 행, category_id가 잘못(null 등) 지정된 행.
// OpenAI 미호출 — 로컬 함수(extractTopCategory)만 재적용하는 순수 데이터 정제.
// 실행: source .env 후 `npx tsx scripts/backfill-extract-top-category.ts`
// 환경변수:
//   DRY=1              쓰기 없이 예측만 출력(카나리)
//   BACKFILL_LIMIT=N   앞 N개만 처리(0=전체)
//   RESTORE=<path>     백업 파일에서 tags·category_id 복원 후 종료(백필 안 함)
// 자동 백업: 비-DRY 실행 시 쓰기 전 전체 (id, tags, category_id) 스냅샷을 scripts/backups/에 저장.
//   백업 실패면 쓰기 중단. 롤백: `RESTORE=scripts/backups/<파일> npx tsx scripts/backfill-extract-top-category.ts`.
//   ※ 파일에 user 데이터 포함 → scripts/backups/ 는 .gitignore. 커밋 금지.
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractTopCategory } from '../lib/tag-alias'

const DRY = process.env.DRY === '1'
const LIMIT = Number(process.env.BACKFILL_LIMIT ?? '0')
const RESTORE = process.env.RESTORE ?? ''

const BACKUP_DIR = join(__dirname, 'backups')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

type Row = { id: string; user_id: string; tags: string[]; category_id: string | null }
type Snapshot = { id: string; tags: string[]; category_id: string | null }

const eq = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i])

// Supabase JS는 쿼리당 최대 1000행 → range로 페이지네이션
async function fetchAll(): Promise<Row[]> {
  const PAGE = 1000
  const all: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('bookmarks')
      .select('id, user_id, tags, category_id')
      .order('created_at')
      .range(from, from + PAGE - 1)
    if (error) throw error
    all.push(...(data as Row[]))
    if (!data || data.length < PAGE) break
  }
  return all
}

// 쓰기 전 전체 스냅샷을 타임스탬프 파일로 저장. 경로 반환. 실패 시 throw → 호출부에서 쓰기 중단.
function backupRows(rows: Row[]): string {
  mkdirSync(BACKUP_DIR, { recursive: true })
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '') // YYYYMMDDTHHMMSS
  const path = join(BACKUP_DIR, `backfill-top-category-${ts}.json`)
  const snapshot: Snapshot[] = rows.map((r) => ({ id: r.id, tags: r.tags ?? [], category_id: r.category_id }))
  writeFileSync(path, JSON.stringify(snapshot))
  return path
}

// 백업 파일의 tags·category_id로 되돌림. 자동 백업의 역연산.
async function restoreFromBackup(path: string): Promise<void> {
  const snapshot: Snapshot[] = JSON.parse(readFileSync(path, 'utf-8'))
  console.log(`[restore] ${snapshot.length}개 복원 · DRY=${DRY}`)
  let restored = 0
  let failed = 0
  for (const { id, tags, category_id } of snapshot) {
    if (DRY) continue
    const { error } = await supabase.from('bookmarks').update({ tags, category_id }).eq('id', id)
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
  if (RESTORE) {
    await restoreFromBackup(RESTORE)
    return
  }

  const all = await fetchAll()
  const rows = LIMIT > 0 ? all.slice(0, LIMIT) : all
  console.log(`[backfill] 대상 ${rows.length}개 · DRY=${DRY}`)

  if (!DRY) {
    const backupPath = backupRows(all) // LIMIT 무관 전체 스냅샷 — 부분 실행도 전량 복원 가능
    console.log(`[backup] ${all.length}개 스냅샷 저장 · ${backupPath}`)
  }

  // (user_id, categoryName) → category_id 메모이즈 — 유저당 고정 13개뿐이라 N+1 방지
  const categoryCache = new Map<string, string | null>()

  let processed = 0
  let changed = 0
  let failed = 0

  for (const row of rows) {
    processed++
    const { category: top, midTags } = extractTopCategory(row.tags ?? [])
    if (!top) continue // 대분류 태그 없음 — 손댈 것 없음

    const cacheKey = `${row.user_id}:${top}`
    let category_id = categoryCache.get(cacheKey)
    if (category_id === undefined) {
      const { data, error } = await supabase
        .from('categories')
        .upsert({ name: top, user_id: row.user_id }, { onConflict: 'user_id,name' })
        .select('id')
        .single()
      if (error) {
        failed++
        console.error(`! 카테고리 upsert 실패 user=${row.user_id} name=${top} | ${error.message}`)
        continue
      }
      const resolvedId: string | null = data?.id ?? null
      category_id = resolvedId
      categoryCache.set(cacheKey, resolvedId)
    }

    const tagsChanged = !eq(midTags, row.tags ?? [])
    const categoryChanged = category_id !== row.category_id
    if (!tagsChanged && !categoryChanged) continue

    changed++
    console.log(
      `~ id=${row.id} tags[${(row.tags ?? []).join(',')}]→[${midTags.join(',')}] category_id ${row.category_id}→${category_id}`,
    )
    if (!DRY) {
      const { error } = await supabase
        .from('bookmarks')
        .update({ tags: midTags, category_id })
        .eq('id', row.id)
      if (error) {
        failed++
        console.error(`! 업데이트 실패 id=${row.id} | ${error.message}`)
      }
    }
    if (processed % 200 === 0) console.log(`[진행] ${processed}/${rows.length} (변경 ${changed}, 실패 ${failed})`)
  }

  console.log(`[완료] 처리 ${processed} · 변경 ${changed} · 실패 ${failed}${DRY ? ' · (DRY: 미반영)' : ''}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
