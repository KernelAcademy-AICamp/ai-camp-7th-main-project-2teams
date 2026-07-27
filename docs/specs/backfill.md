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

### backfill-bookmark-description.ts

- 위치: `front/scripts/backfill-bookmark-description.ts`
- 대상: `description IS NULL`인 기존 북마크
- 배경: `POST /api/bookmarks`(route.ts:56)는 `fetchMeta()`로 항상 description을 채우지만, 그 이전 저장분은 NULL로 남음(2026-07-10 기준 942/944행)
- 방식: 대상 행의 url을 `fetchMeta()`로 재크롤링해 description 확보 후 갱신. OpenAI 미호출(재태깅·재임베딩 없음). 못 찾으면 NULL 유지(재실행 가능)
- 실행: 기본 dry-run, `--apply` 플래그로 실제 반영

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

## 신규 백필 추가 규칙

새 백필 스킬(`.claude/skills/*backfill*/SKILL.md`)이나 스크립트(`front/scripts/backfill-*.ts`)를 추가하면
**이 문서에 위 형식으로 항목을 반드시 추가**한다: 위치, 대상, 배경(왜 과거 데이터가 안 맞는지), 방식, 실행 방법.

파일 생성 시 PostToolUse 훅이 리마인더를 띄운다(`.claude/settings.json` 참조) — 훅은 알림만 하고 문서 갱신은 수동.
