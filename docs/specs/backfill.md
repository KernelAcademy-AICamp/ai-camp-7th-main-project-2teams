# 백필(Backfill) 목록

과거 데이터가 현재 로직/프롬프트 기준에 맞지 않아 사후 정정이 필요한 작업들의 단일 인덱스.
"버그"가 아니라 "로직은 개선되는데 과거 데이터는 안 따라가는" 구조적 드리프트를 메우는 용도.

두 종류로 나뉜다:

- **스킬(주기적, 사용자 직접 호출)**: AI 재태깅처럼 매번 결과가 달라질 수 있는 작업. `.claude/skills/`에 위치.
- **스크립트(일회성 ops)**: 결정적 로직 재적용이나 데이터 정제. `front/scripts/`에 위치, 실행 후 보통 폐기.

## 스킬 (주기적)

### category-backfill

- 위치: `.claude/skills/category-backfill/SKILL.md`
- 대상: `category_id`가 null이거나 대분류 태그가 빠진 북마크
- 배경: `lib/ai.ts` SYSTEM_PROMPT가 계속 개선되는데 과거 저장분은 구버전 프롬프트로 태깅됨
- 방식: `generateTags()` 재호출 → `extractTopCategory()`로 대분류 재해석 → `category_id`/`tags` 갱신
- 억지 분류 금지: 완전 미분류(그룹1)는 재시도해도 정상적으로 안 되는 케이스 존재(로그인 화면 등)
- 구현 스크립트: `front/scripts/category-backfill.ts`. 실행은 `node --env-file=.env ./node_modules/.bin/vite-node scripts/category-backfill.ts` — `--experimental-strip-types`는 `ERR_MODULE_NOT_FOUND`로 죽는다(`lib/ai.ts`가 `'./openai'`를 확장자 없이 import해 Node ESM이 해석 못 함). 중단돼도 재실행 안전(분류된 행은 `category_id`가 채워져 대상에서 빠짐)
- 이미 카테고리가 붙은 **오분류는 대상 밖** — `category_id IS NULL`만 잡는다. 그 구간은 `retag.ts` 영역

### game-tag-backfill

- 위치: `.claude/skills/game-tag-backfill/SKILL.md`
- 대상: 게임 카테고리 북마크 중 게임명 소분류 태그 누락분
- 배경: "게임 카테고리에서 게임명 필수 포함" 규칙이 신규 저장분부터만 적용됨
- 방식: title/url로 게임명 식별 → 기존 tags에 게임명만 추가(다른 태그 유지)
- category-backfill과 스코프 안 겹침(게임 카테고리 전용, 소분류만)

### cross-lingual-search-alias

- 위치: `.claude/skills/cross-lingual-search-alias/SKILL.md`
- 대상: `front/lib/search-alias.ts`의 `SEARCH_ALIAS` 사전에 없는 한/영 브랜드명 쌍
- 배경: 임베딩이 음차 표기(피그마)와 원어(Figma)를 가깝게 두지 못함(실측 코사인 0.09~0.44, relevance floor 0.4 미달). 사전이 쿼리를 원어까지 확장해 우회하는데, 새 북마크가 쌓이면 사전에 없는 브랜드명이 계속 생김
- 방식: 북마크 `tags`/`title` distinct 순회 → 사전 미등재 브랜드명 식별 → `SEARCH_ALIAS`에 항목 추가(코드 수정, DB 미변경)
- 다른 두 스킬과 달리 데이터가 아닌 **코드 사전**을 갱신 — 재태깅·재임베딩 없음

## 스크립트 (일회성 ops)

### backfill-extract-top-category.ts

- 위치: `front/scripts/backfill-extract-top-category.ts`
- 대상: tags 배열에 대분류명이 잔존하거나 category_id가 잘못 지정된 행
- 배경: `extractTopCategory` 버그 수정(`resolveTopCategory`→`extractTopCategory`) 반영. OpenAI 미호출, 순수 로컬 함수 재적용
- 실행: `DRY=1 npx tsx scripts/backfill-extract-top-category.ts` (dry-run 기본) → 실행 전 자동 백업(`scripts/backups/`) → `RESTORE=<path>`로 롤백 가능

### backfill-normalize-url.ts

- 위치: `front/scripts/backfill-normalize-url.ts`
- 대상: URL 정규화 미적용 구행, canonical URL 중복행
- 전제: `supabase/migrations/0007_backup_before_url_normalize.sql` 먼저 적용
- 실행: 기본 dry-run, `--apply` 플래그로 실제 반영. dedup 판단은 `lib/backfillUrlPlan.ts` 순수 함수(테스트 있음)에 위임

### backfill-bookmark-thumbnail.ts

- 위치: `front/scripts/backfill-bookmark-thumbnail.ts`
- 대상: `thumbnail_url IS NULL`인 기존 북마크 (0017 마이그레이션은 컬럼만 추가, 과거 저장분은 전부 NULL)
- 배경: 썸네일은 `POST /api/bookmarks`가 content 없을 때만 크롤링 → 과거 저장분·익스텐션 저장분(content 있음)은 누락
- 방식: 대상 행의 url을 `fetchMeta()`로 재크롤링(og:image/YouTube 썸네일) → `isSafeHttpUrl`로 SSRF 재검증 → `thumbnail_url` 갱신. 못 찾으면 NULL 유지(재실행 가능)
- 실행: 기본 dry-run, `--apply` 플래그로 실제 반영. 단순 추가 컬럼이라 백업 스냅샷 없이 `thumbnail_url = NULL` 재설정으로 되돌림 가능

### backfill-bookmark-title.ts

- 위치: `front/scripts/backfill-bookmark-title.ts`
- 대상: `title`이 URL 형태(플레이스홀더)이거나 junk title("Untitled"·"403 Forbidden" 등)인 행. **실제 title이 있는 행은 건드리지 않음**
- 배경: 세 갈래
  - `import/route.ts`가 `fetchMeta(url)`로 실제 title을 조회하고도 버리던 버그(수정됨) — 수정 전 저장분은 `title` 컬럼에 url 문자열이 그대로 들어감
  - `fetchMeta`의 junk-title 필터(`isJunkTitle`) 도입 전 저장분은 `"Untitled"`류가 그대로 남음
  - title 플레이스홀더는 **정규화 전** raw href(`si=`·`fbclid=`·`igsh=`·`utm_*` 등 트래킹 파라미터 포함)로 저장되는데 `url` 컬럼은 `normalizeUrl()`을 거쳐 파라미터가 빠진다. 그 결과 `title !== url`이 되어 기존 "정확 일치" 조건으로 못 잡던 케이스가 90건 있었음 → `http(s)://`로 시작하면 플레이스홀더로 간주하도록 조건 완화
- 방식: 대상 행의 url을 `fetchMeta()`로 재크롤링해 실제 title 확보 후 `title` 컬럼만 교체. **OpenAI 미호출**(재태깅·재임베딩 없음). 못 찾으면 건너뜀(재실행 가능)
- 실행: `set -a; . ./.env; set +a` 후
  - `npx tsx scripts/backfill-bookmark-title.ts` — DRY-RUN(기본), 계획만 출력
  - `npx tsx scripts/backfill-bookmark-title.ts --apply` — 실제 반영
- 백업 없음 — 되돌림이 필요하면 실행 전 `(id, title)` 스냅샷을 수동으로 뜰 것. 다만 대상이 플레이스홀더·junk title이라 복구 가치가 낮다

### backfill-bookmark-description.ts

- 위치: `front/scripts/backfill-bookmark-description.ts`
- 대상: `description IS NULL`인 기존 북마크
- 배경: `POST /api/bookmarks`(route.ts:56)는 `fetchMeta()`로 항상 description을 채우지만, 그 이전 저장분은 NULL로 남음(2026-07-10 기준 942/944행)
- 방식: 대상 행의 url을 `fetchMeta()`로 재크롤링해 description 확보 후 갱신. OpenAI 미호출(재태깅·재임베딩 없음). 못 찾으면 NULL 유지(재실행 가능)
- 실행: 기본 dry-run, `--apply` 플래그로 실제 반영

### backfill-tag-aliases.ts

- 위치: `front/scripts/backfill-tag-aliases.ts`
- 대상: 전체 `bookmarks` 순회 후 **`normalizeTags()` 결과가 현재 값과 달라지는 행만** 갱신
- 배경: `lib/tag-alias.ts`의 `TAG_ALIAS`/`CATEGORY_ALIAS`에 새 매핑을 추가해도 **신규 저장분에만 적용**된다. 기존 행은 구 표기 그대로 남아 같은 개념 태그가 표기 분열된다(예: `쿠팡파트너스` vs `쿠팡 파트너스`, `클로드코드` vs `Claude Code`)
- 방식: `extractTopCategory(normalizeTags(tags)).midTags`로 재계산 후 `tags` 컬럼만 교체.
  - **OpenAI 미호출** — 순수 함수 재적용이라 결정적이고 비용 0
  - `extractTopCategory`를 한 번 더 태우는 이유: `normalizeTags`만 적용하면 대분류 alias(`UI`→`디자인` 등)로 바뀐 토큰이 `tags`에 남는다. 대분류 라벨을 걷어내 "tags는 중·소분류 전용" 불변식을 유지한다
  - **`category_id`는 미변경** — 대분류 재판정은 `retag.ts` 영역
- 실행: `front/`에서 `node --experimental-strip-types --env-file=.env scripts/backfill-tag-aliases.ts`
  - `DRY=1` — 쓰기 없이 변경 예정 목록만 출력
- 자동 백업: 비-DRY 실행 시 **변경 대상만** `(id, tags)` 스냅샷을 `scripts/backups/alias-backfill-<ts>.json`에 저장. 롤백은 `RESTORE=<path> npx tsx scripts/retag.ts`
- 다른 스크립트와 달리 폐기 대상 아님 — alias 사전이 갱신될 때마다 재사용

### backfill-dead-link.ts

- 위치: `front/scripts/backfill-dead-link.ts`
- 대상: 전체 `bookmarks` (필터 없음)
- 배경: `is_dead`는 신규 저장 시점(`POST /api/bookmarks`)부터만 기록됨 — 기존 저장분은 전부 `false`로 시작해 실제 죽은 링크 여부가 반영 안 됨
- 방식: `fetchMeta()` 전체 재호출 대신 상태 코드만 가볍게 확인(HEAD 우선, 405/501이면 GET 폴백) → `isDeadStatus()`(404/410만 dead)로 판정 → 값이 바뀌는 행만 갱신
- 실행: 기본 dry-run, `--apply` 플래그로 실제 반영. 재실행 시 이미 반영된 행은 건너뜀(idempotent)

### reembed.ts

- 위치: `front/scripts/reembed.ts`
- 대상: 전체 `bookmarks`(또는 `REEMBED_SINCE` 이후 생성분)
- 배경: 임베딩 모델 전환(3-small → 3-large, `lib/ai.ts` `EMBEDDING_MODEL`) 시 모델 간 벡터 공간이 비호환 — 검색 쿼리 임베딩과 좌표계를 맞추려면 전량 재생성 필수. 임베딩 입력 규약(title+description+태그)이 바뀔 때도 동일
- 방식: `title + description + 태그` 재조합 → `createEmbedding()` 재호출 → `embedding` 갱신. description 없으면 weak 경로(title + LLM 한줄요약 + 태그, `POST /api/bookmarks` weak 경로와 동일 규약)
- 실행: `source .env` 후 `npx tsx scripts/reembed.ts`
  - `DRY=1` — 쓰기 없이 대상 집계만 출력
  - `REEMBED_LIMIT=N` — 앞 N개만 처리(0=전체)
  - `REEMBED_SINCE=YYYY-MM-DD` — `created_at` 하한(미지정 시 전량). 신규 저장분만 재처리할 때 사용
- 백업 없음 — 임베딩은 원본(title·description·tags)에서 언제든 재생성 가능. 롤백 = 구 모델로 재실행
- 다른 스크립트와 달리 폐기 대상 아님 — 모델·입력 규약이 바뀔 때마다 재사용

### retag.ts

- 위치: `front/scripts/retag.ts`
- 대상: 전체 `bookmarks` (필터 없음)
- 배경: `SYSTEM_PROMPT`(`lib/ai.ts`)는 경계 규칙이 추가될 때마다 개선되는데 과거 저장분은 그 당시 기준으로 태깅돼 있다. `category-backfill` 스킬은 `category_id IS NULL`만 잡으므로 **이미 카테고리가 붙어 있는 오분류는 건드리지 못한다** — 그 구간을 담당하는 유일한 경로
- 방식: `generateTags()` 재호출 → `extractTopCategory(normalizeTags(...))` → `category_id`·`tags` 갱신. 새 결과가 빈 슬롯(최대 2개)을 남기면 `mergeTags()`로 기존 태그를 채워 `game-tag-backfill` 등이 넣은 값의 유실 방지
- 실행: `source .env` 후 `npx tsx scripts/retag.ts`
  - `DRY=1` — 쓰기 없이 예측만 출력(카나리)
  - `RETAG_LIMIT=N` — 앞 N개만 처리(0=전체). **선택적 필터가 아니라 단순 절단** — 특정 건만 고를 수 없다
  - `CONCURRENCY=N` — 동시 OpenAI 호출 수(기본 6). 아래 주의 참조
  - `KEEP_NONEMPTY=0` — 새 태그가 빈 배열이어도 반영(순손실 허용). 기본 true
  - `RESTORE=<path>` — 백업 파일에서 tags 복원 후 종료
- 자동 백업: 비-DRY 실행 시 쓰기 전 `(id, tags)` 스냅샷을 `scripts/backups/`에 저장. 백업 실패 시 쓰기 중단

> **주의 1 — `CONCURRENCY` 기본값 6은 TPM 한도를 넘는다.**
> `tag-eval.test.ts`(`PACING_MS` 주석) 실측상 **순차 호출만으로도** gpt-4o-mini 200k TPM에 붙는다(항목당 ~2.9k 토큰).
> 2026-07-28 `category-backfill`이 페이싱 없이 순차 실행하다 429로 즉사했다(`Used 199334 / Limit 200000`, 처리 0건).
> 동시 6이면 확실히 초과하므로 **`CONCURRENCY`를 낮추거나 페이싱을 넣지 않으면 실패한다.**

> **주의 2 — `category_id`는 롤백되지 않는다.**
> 자동 백업(`TagSnapshot`)은 **tags만** 커버한다. 대분류를 되돌리려면 실행 전 `(id, category_id)` 스냅샷을 **수동으로** 떠야 한다.

- 다른 스크립트와 달리 폐기 대상 아님 — 프롬프트가 바뀔 때마다 재사용

#### 전량 재태깅 보류 (2026-07-28)

- 계기: 프롬프트 3회 변경 — 쇼핑 경계 규칙(#327) · Claude/Claude Code alias 분리(#330) · 로그인 페이지 정책(#331). 기존 1039건은 전부 구 기준으로 태깅된 상태
- 실익: eval 실측(n=215)에서 `emptyRate` 0.030→0.0149, title-only 대분류 0.8326→0.8512. 재태깅하면 이 개선이 기존 데이터에 소급된다
- 보류 사유: 위 주의 1·2 대응(동시성 조정 + `category_id` 스냅샷)이 선행돼야 하고, 비용이 1039 × gpt-4o-mini다
- 긴급성 해소: 즉시 문제였던 제휴마케팅 3건(쇼핑→비즈니스 오분류)은 **수동 UPDATE로 처리 완료**. 표기 흔들림 1건은 `backfill-tag-aliases.ts`로 반영
- 재개 조건: 미분류·오분류가 다시 눈에 띄게 쌓이거나, 프롬프트가 한 번 더 크게 바뀔 때

## 신규 백필 추가 규칙

새 백필 스킬(`.claude/skills/*backfill*/SKILL.md`)이나 스크립트(`front/scripts/backfill-*.ts`)를 추가하면
**이 문서에 위 형식으로 항목을 반드시 추가**한다: 위치, 대상, 배경(왜 과거 데이터가 안 맞는지), 방식, 실행 방법.

파일 생성 시 PostToolUse 훅이 리마인더를 띄운다(`.claude/settings.json` 참조) — 훅은 알림만 하고 문서 갱신은 수동.
