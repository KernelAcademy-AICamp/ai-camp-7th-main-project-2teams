/**
 * 기존 북마크 description 백필 (일회성 ops 스크립트).
 *
 * 배경: description(og:description)은 POST /api/bookmarks가 fetchMeta()로 항상 채우도록
 * route.ts:56에서 처리되지만, 그 이전 저장분(942/944행, 2026-07-10 확인)은 NULL로 남아있음.
 *
 * 실행:
 *   set -a; . ./.env; set +a
 *   npx tsx scripts/backfill-bookmark-description.ts            # DRY-RUN(기본) — 계획만 출력
 *   npx tsx scripts/backfill-bookmark-description.ts --apply     # 실제 반영
 *
 * 동작: description IS NULL인 행만 대상으로 url을 fetchMeta()로 재크롤링해 description 확보 후 갱신.
 * OpenAI 호출 없음(재태깅·재임베딩 안 함) — description 컬럼만 교체. 못 찾으면 건너뜀(재실행 가능).
 */
import { createClient } from "@supabase/supabase-js";
import { fetchMeta } from "../lib/fetchMeta";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("환경변수 필요: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  console.error("  set -a; . ./.env; set +a 로 로드 후 재실행");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const PAGE_SIZE = 1000;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Row = { id: string; url: string };

// description IS NULL 행만 페이지네이션으로 수집 — 이미 채워진 행은 재크롤링 불필요.
async function fetchTargetRows(): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("bookmarks")
      .select("id, url")
      .is("description", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`조회 실패: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...(data as Row[]));
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function main(): Promise<void> {
  const rows = await fetchTargetRows();
  console.log(`대상(description NULL): ${rows.length}행 · ${APPLY ? "적용" : "DRY-RUN"}`);

  let found = 0;
  let skipped = 0;
  let failed = 0;

  for (const [i, row] of rows.entries()) {
    const meta = await fetchMeta(row.url);
    if (!meta.description) {
      skipped++;
      continue;
    }

    found++;
    console.log(`~ id=${row.id} description→${meta.description.slice(0, 60)}`);

    if (APPLY) {
      const { error } = await supabase.from("bookmarks").update({ description: meta.description }).eq("id", row.id);
      if (error) {
        failed++;
        console.error(`! 업데이트 실패 id=${row.id} | ${error.message}`);
      }
    }

    if ((i + 1) % 50 === 0) console.log(`[진행] ${i + 1}/${rows.length}`);
  }

  console.log(
    `[완료] 스캔 ${rows.length} · description 발견 ${found} · 건너뜀 ${skipped} · 실패 ${failed}` +
      (APPLY ? "" : " · (DRY-RUN: 미반영, --apply로 실제 반영)"),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
