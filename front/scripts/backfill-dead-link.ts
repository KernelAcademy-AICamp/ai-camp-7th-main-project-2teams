/**
 * 기존 저장된 북마크 URL의 404/410(죽은 링크) 여부를 일괄 감지해 is_dead 컬럼 백필 (일회성 ops 스크립트).
 *
 * 배경: is_dead는 신규 저장 시점부터만 기록됨(POST /api/bookmarks) — 기존 저장분은 이 스크립트로 소급 반영.
 * fetchMeta() 전체 재호출은 title/description/content까지 다시 파싱해 무겁고 불필요 →
 * 상태 코드만 확인하는 경량 체크(HEAD 우선, 405/501이면 GET 폴백)를 별도로 사용.
 *
 * 실행:
 *   set -a; . ./.env; set +a
 *   npx tsx scripts/backfill-dead-link.ts            # DRY-RUN(기본) — 계획만 출력
 *   npx tsx scripts/backfill-dead-link.ts --apply     # 실제 반영
 *
 * 동작: 전체 bookmarks(필터 없음)를 순회해 각 url의 상태 코드를 확인, is_dead 값이 바뀌는 행만 갱신.
 * 재실행 시 이미 반영된 행은 건너뜀(idempotent).
 */
import { createClient } from '@supabase/supabase-js'
import { isDeadStatus } from '../lib/fetchMeta'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('환경변수 필요: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  console.error('  set -a; . ./.env; set +a 로 로드 후 재실행')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const PAGE_SIZE = 1000
const CHECK_TIMEOUT_MS = 5000
// fetchMeta.ts와 동일한 User-Agent — 일부 사이트가 UA 기준으로 다른 응답을 주는 경우 판정 일관성 유지.
const USER_AGENT = 'Mozilla/5.0 (compatible; BookmarkBot/1.0)'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type Row = { id: string; url: string; is_dead: boolean }

// fetchMeta.ts 전체 재호출(HTML 파싱) 없이 상태 코드만 가볍게 확인.
// HEAD 우선 — 405(Method Not Allowed)/501(Not Implemented)이면 HEAD 미지원 서버로 보고 GET 폴백.
async function checkStatus(url: string): Promise<number | null> {
  try {
    const headRes = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT },
    })
    if (headRes.status !== 405 && headRes.status !== 501) return headRes.status

    const getRes = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT },
    })
    return getRes.status
  } catch {
    return null
  }
}

// 전체 bookmarks 페이지네이션 순회 — title 백필과 달리 필터 없음(모든 행 대상).
async function fetchAllRows(): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('bookmarks')
      .select('id, url, is_dead')
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
  const rows = await fetchAllRows()
  console.log(`대상(전체 bookmarks): ${rows.length}행 · ${APPLY ? '적용' : 'DRY-RUN'}`)

  let changed = 0
  let unchanged = 0
  let failed = 0

  for (const [i, row] of rows.entries()) {
    const status = await checkStatus(row.url)
    const dead = isDeadStatus(status)

    if (dead !== row.is_dead) {
      changed++
      console.log(`~ id=${row.id} is_dead ${row.is_dead}→${dead} (status=${status})`)

      if (APPLY) {
        const { error } = await supabase
          .from('bookmarks')
          .update({ is_dead: dead })
          .eq('id', row.id)
        if (error) {
          failed++
          console.error(`! 업데이트 실패 id=${row.id} | ${error.message}`)
        }
      }
    } else {
      unchanged++
    }

    if ((i + 1) % 50 === 0) console.log(`[진행] ${i + 1}/${rows.length}`)
  }

  console.log(
    `[완료] 스캔 ${rows.length} · 변경 대상 ${changed} · 변화없음 ${unchanged} · 실패 ${failed}` +
      (APPLY ? '' : ' · (DRY-RUN: 미반영, --apply로 실제 반영)'),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
