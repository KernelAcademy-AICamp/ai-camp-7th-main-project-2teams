/**
 * 기존 북마크 URL 정규화 백필 (일회성 ops 스크립트).
 *
 * 전제: supabase/migrations/0007_backup_before_url_normalize.sql 를 먼저 적용(백업 필수).
 *
 * 실행:
 *   # 1) 백업 마이그레이션 적용 후
 *   # 2) DRY-RUN (기본) — 변경 계획만 출력, DB 무변경
 *   set -a; . ./.env; set +a
 *   npx tsx scripts/backfill-normalize-url.ts
 *   # 3) 실제 적용
 *   npx tsx scripts/backfill-normalize-url.ts --apply
 *
 * 동작: (user_id, canonical URL) 중복 중 최신 1건 유지·나머지 삭제, 유지행 url을 canonical로 교체.
 * dedup 판단 로직은 lib/backfillUrlPlan.ts(순수 함수, 테스트 있음)에 위임.
 */
import { createClient } from '@supabase/supabase-js'
import { planUrlBackfill, type BackfillRow } from '../lib/backfillUrlPlan'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('환경변수 필요: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  console.error('  set -a; . ./.env; set +a 로 로드 후 재실행')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const PAGE_SIZE = 1000

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// 전체 북마크를 페이지네이션으로 수집 (embedding 제외 — 정규화·dedup에 불필요, 유출 방지).
async function fetchAllRows(): Promise<BackfillRow[]> {
  const rows: BackfillRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('bookmarks')
      .select('id, user_id, url, created_at')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`조회 실패: ${error.message}`)
    if (!data || data.length === 0) break
    rows.push(...(data as BackfillRow[]))
    if (data.length < PAGE_SIZE) break
  }
  return rows
}

async function main(): Promise<void> {
  const rows = await fetchAllRows()
  const plan = planUrlBackfill(rows)

  console.log(`스캔: ${rows.length}행`)
  console.log(`삭제(중복): ${plan.deleteIds.length}행`)
  console.log(`URL 정규화 업데이트: ${plan.updates.length}행`)

  if (!APPLY) {
    console.log('\n[DRY-RUN] DB 무변경. 실제 적용은 --apply 플래그.')
    return
  }

  // 백업 테이블 확인 — 없으면 중단(마이그레이션 0007 미적용 방지).
  const { error: backupErr } = await supabase
    .from('bookmarks_backup_url_norm')
    .select('id', { count: 'exact', head: true })
  if (backupErr) {
    console.error('백업 테이블 bookmarks_backup_url_norm 없음 — 0007 마이그레이션 먼저 적용 필요.')
    process.exit(1)
  }

  // 순서 중요: 삭제 먼저 → 유지행 canonical 업데이트(잔존 중복과의 unique 충돌 방지).
  if (plan.deleteIds.length > 0) {
    // in() 인자 상한 회피 — 청크 분할 삭제
    for (let i = 0; i < plan.deleteIds.length; i += 200) {
      const chunk = plan.deleteIds.slice(i, i + 200)
      const { error } = await supabase.from('bookmarks').delete().in('id', chunk)
      if (error) throw new Error(`삭제 실패: ${error.message}`)
    }
  }

  for (const { id, url } of plan.updates) {
    const { error } = await supabase.from('bookmarks').update({ url }).eq('id', id)
    if (error) throw new Error(`업데이트 실패(id=${id}): ${error.message}`)
  }

  console.log('\n완료. 검증 후 이상 없으면 bookmarks_backup_url_norm 폐기 가능.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
