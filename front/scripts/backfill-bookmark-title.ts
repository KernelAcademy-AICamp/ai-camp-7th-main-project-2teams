/**
 * 카카오톡 CSV 임포트로 title=url placeholder가 박힌 북마크의 title 백필 (일회성 ops 스크립트).
 *
 * 배경: import/route.ts가 fetchMeta(url)로 실제 title을 조회하고도 버리던 버그(수정됨) —
 * 수정 전 저장분은 title 컬럼에 url 문자열이 그대로 들어가 있음.
 *
 * 실행:
 *   set -a; . ./.env; set +a
 *   npx tsx scripts/backfill-bookmark-title.ts            # DRY-RUN(기본) — 계획만 출력
 *   npx tsx scripts/backfill-bookmark-title.ts --apply     # 실제 반영
 *
 * 동작: title = url인 행만 대상으로 fetchMeta()를 재호출해 실제 title 확보 후 갱신.
 * OpenAI 호출 없음(재태깅·재임베딩 안 함) — title 컬럼만 교체. 못 찾으면 건너뜀(재실행 가능).
 */
import { createClient } from '@supabase/supabase-js'
import { fetchMeta } from '../lib/fetchMeta'

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

type Row = { id: string; url: string }

// title = url인 행만 페이지네이션으로 수집 — 이미 실제 title이 있는 행은 건드리지 않음.
async function fetchTargetRows(): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('bookmarks')
      .select('id, url, title')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`조회 실패: ${error.message}`)
    if (!data || data.length === 0) break
    for (const row of data as Array<{ id: string; url: string; title: string }>) {
      if (row.title === row.url) rows.push({ id: row.id, url: row.url })
    }
    if (data.length < PAGE_SIZE) break
  }
  return rows
}

async function main(): Promise<void> {
  const rows = await fetchTargetRows()
  console.log(`대상(title=url): ${rows.length}행 · ${APPLY ? '적용' : 'DRY-RUN'}`)

  let found = 0
  let skipped = 0
  let failed = 0

  for (const [i, row] of rows.entries()) {
    const meta = await fetchMeta(row.url)
    if (!meta.title) {
      skipped++
      continue
    }

    found++
    console.log(`~ id=${row.id} title→${meta.title}`)

    if (APPLY) {
      const { error } = await supabase
        .from('bookmarks')
        .update({ title: meta.title })
        .eq('id', row.id)
      if (error) {
        failed++
        console.error(`! 업데이트 실패 id=${row.id} | ${error.message}`)
      }
    }

    if ((i + 1) % 50 === 0) console.log(`[진행] ${i + 1}/${rows.length}`)
  }

  console.log(
    `[완료] 스캔 ${rows.length} · title 발견 ${found} · 건너뜀 ${skipped} · 실패 ${failed}` +
      (APPLY ? '' : ' · (DRY-RUN: 미반영, --apply로 실제 반영)'),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
