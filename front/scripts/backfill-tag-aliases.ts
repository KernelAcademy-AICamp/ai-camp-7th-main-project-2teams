// 신규 tag-alias.ts 매핑(클로드코드/Codex 등)을 기존 tags에 소급 적용.
// AI 재호출 없음 — normalizeTags() 순수 함수만으로 표기 통일. category_id는 건드리지 않음.
// 실행: front/에서 `node --experimental-strip-types --env-file=.env scripts/backfill-tag-aliases.ts`
// 환경변수:
//   DRY=1  쓰기 없이 변경 예정 목록만 출력
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeTags, extractTopCategory } from '../lib/tag-alias.ts'
import { serializeBackup, type TagSnapshot } from './retag-backup.ts'

const DRY = process.env.DRY === '1'
const BACKUP_DIR = join(import.meta.dirname, 'backups')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

type Row = { id: string; tags: string[] }

const eq = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i])

// Supabase JS 쿼리당 최대 1000행 → range 페이지네이션
async function fetchAll(): Promise<Row[]> {
  const PAGE = 1000
  const all: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('bookmarks')
      .select('id, tags')
      .order('created_at')
      .range(from, from + PAGE - 1)
    if (error) throw error
    all.push(...((data ?? []) as Row[]))
    if (!data || data.length < PAGE) break
  }
  return all
}

async function main() {
  const rows = await fetchAll()
  console.log(`[backfill-tag-aliases] 전체 ${rows.length}건 · DRY=${DRY}`)

  // normalizeTags만 적용하면 대분류 alias(UI→디자인 등)로 바뀐 토큰이 tags에 남는다 —
  // extractTopCategory로 한 번 더 걸러 대분류 라벨은 제거(중·소분류 전용 불변식 유지). category_id는 미변경.
  const changes = rows
    .map((row) => ({ row, next: extractTopCategory(normalizeTags(row.tags ?? [])).midTags }))
    .filter(({ row, next }) => !eq(row.tags ?? [], next))

  if (changes.length === 0) {
    console.log('변경 대상 없음')
    return
  }

  for (const { row, next } of changes) {
    console.log(`~ [${(row.tags ?? []).join(',')}] → [${next.join(',')}] | id=${row.id}`)
  }

  if (DRY) {
    console.log(`\n[완료] 변경 예정 ${changes.length}건 (DRY: 미반영)`)
    return
  }

  // 쓰기 전 백업 — 변경 대상만 스냅샷(원본 tags 보존, 롤백은 retag.ts RESTORE로)
  mkdirSync(BACKUP_DIR, { recursive: true })
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
  const backupPath = join(BACKUP_DIR, `alias-backfill-${ts}.json`)
  const snapshot: TagSnapshot[] = changes.map(({ row }) => ({ id: row.id, tags: row.tags ?? [] }))
  writeFileSync(backupPath, serializeBackup(snapshot))
  console.log(`[backup] ${snapshot.length}개 스냅샷 저장 · ${backupPath}`)

  let ok = 0
  let failed = 0
  for (const { row, next } of changes) {
    const { error } = await supabase.from('bookmarks').update({ tags: next }).eq('id', row.id)
    if (error) {
      failed++
      console.error(`! 실패 id=${row.id} | ${error.message}`)
    } else {
      ok++
    }
  }
  console.log(`\n[완료] 반영 ${ok}건 · 실패 ${failed}건`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
