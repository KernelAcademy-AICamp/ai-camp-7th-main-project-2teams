/**
 * 기존 북마크 썸네일(thumbnail_url) 백필 (일회성 ops 스크립트).
 *
 * 배경: supabase/migrations/0017_bookmark_thumbnail_url.sql 컬럼 추가는 신규 저장분부터만
 * 채워짐(POST /api/bookmarks가 content 없을 때만 fetchMeta 호출) — 과거 저장분은 전부 NULL.
 *
 * 실행:
 *   set -a; . ./.env; set +a
 *   npx tsx scripts/backfill-bookmark-thumbnail.ts            # DRY-RUN(기본) — 계획만 출력
 *   npx tsx scripts/backfill-bookmark-thumbnail.ts --apply     # 실제 반영
 *
 * 동작: thumbnail_url IS NULL인 행만 대상으로 url을 fetchMeta()로 재크롤링(og:image/YouTube 썸네일),
 * SSRF 안전성 재검증(isSafeHttpUrl) 후 thumbnail_url 갱신. 못 찾으면 건너뜀(NULL 유지, 재실행 가능).
 * 순수 추가 컬럼이라 되돌림도 간단: UPDATE bookmarks SET thumbnail_url = NULL WHERE id IN (...).
 */
import { createClient } from '@supabase/supabase-js'
import { fetchMeta } from '../lib/fetchMeta'
import { isSafeHttpUrl } from '../lib/ssrf'

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

// thumbnail_url IS NULL 행만 페이지네이션으로 수집 — 이미 채워진 행은 재크롤링 불필요.
async function fetchTargetRows(): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('bookmarks')
      .select('id, url')
      .is('thumbnail_url', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`조회 실패: ${error.message}`)
    if (!data || data.length === 0) break
    rows.push(...(data as Row[]))
    if (data.length < PAGE_SIZE) break
  }
  return rows
}

async function main(): Promise<void> {
  const rows = await fetchTargetRows()
  console.log(`대상(thumbnail_url NULL): ${rows.length}행 · ${APPLY ? '적용' : 'DRY-RUN'}`)

  let found = 0
  let skipped = 0
  let failed = 0

  for (const [i, row] of rows.entries()) {
    if (!isSafeHttpUrl(row.url)) {
      skipped++
      continue
    }

    const meta = await fetchMeta(row.url)
    if (!meta.thumbnailUrl || !isSafeHttpUrl(meta.thumbnailUrl)) {
      skipped++
      continue
    }

    found++
    console.log(`~ id=${row.id} thumbnail_url→${meta.thumbnailUrl}`)

    if (APPLY) {
      const { error } = await supabase
        .from('bookmarks')
        .update({ thumbnail_url: meta.thumbnailUrl })
        .eq('id', row.id)
      if (error) {
        failed++
        console.error(`! 업데이트 실패 id=${row.id} | ${error.message}`)
      }
    }

    if ((i + 1) % 50 === 0) console.log(`[진행] ${i + 1}/${rows.length}`)
  }

  console.log(
    `[완료] 스캔 ${rows.length} · 썸네일 발견 ${found} · 건너뜀 ${skipped} · 실패 ${failed}` +
      (APPLY ? '' : ' · (DRY-RUN: 미반영, --apply로 실제 반영)'),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
