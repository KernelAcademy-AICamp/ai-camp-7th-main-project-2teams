---
name: category-backfill
description: 미분류(category_id null)이거나 대분류 태그가 빠진 북마크를 최신 태깅 프롬프트로 재분류한다. 주기적으로 사용자가 직접 호출.
---

# 카테고리 재분류 백필

## 배경

`lib/ai.ts` SYSTEM_PROMPT는 세션마다 계속 개선됨(우선순위 규칙·경계 케이스 추가 등). 과거에 저장된
북마크는 그 당시 프롬프트로 태깅돼 있어, 현재 프롬프트라면 정확히 분류될 내용도 미분류로 남아있을 수 있음.
버그가 아니라 "프롬프트는 개선되는데 과거 데이터는 안 따라가는" 구조적 드리프트 — 주기적 재처리 필요.

## 실행 순서

1. **대상 조회**: Supabase(`mcp__supabase__execute_sql`)로 두 그룹 조회.
   ```sql
   -- 그룹 1: 완전 미분류(0태그) — 재시도 후보
   select id, title, url, tags from bookmarks where category_id is null and array_length(tags, 1) is null;
   -- 그룹 2: 태그는 있는데 대분류 누락(중/소분류만 존재) — 프롬프트 드리프트 의심 케이스
   select id, title, url, tags from bookmarks where category_id is null and array_length(tags, 1) > 0;
   ```
   그룹 2가 우선순위 높음 — 이미 도메인 신호(태그)가 있는데 category만 비어있는 명백한 드리프트 케이스.

2. **재태깅**: 각 row에 대해 `generateTags({ title, url })` 호출(스크립트, 실제 OpenAI 키 사용).
   description 없으면 `lib/fetchMeta.ts`의 `fetchMeta(url)`로 1회 보강 후 재시도(game-tag-backfill과 동일 패턴).
   결과가 이전과 동일하거나 여전히 대분류 없으면 스킵 — 정말 미분류가 맞는 케이스(로그인/도구 대시보드 등)일 수 있음, 억지 분류 금지.

3. **카테고리 해석**: 재태깅 결과에 `lib/tag-alias.ts`의 `extractTopCategory(normalizeTags(rawTags))` 그대로 적용해
   대분류/중·소분류 분리 (`app/api/bookmarks/route.ts`의 실제 로직과 동일하게 재사용 — 새 로직 작성 안 함).

4. **DB 갱신**: 대분류 찾으면 `categories` 테이블에서 해당 user의 이름으로 upsert 후 `category_id` 갱신,
   `tags` 컬럼은 중·소분류로 교체(기존 태그 버리지 않되 대분류 토큰은 tags에 남기지 않음 — 저장 시점 로직과 동일 불변식 유지).

5. **보고**: 재분류된 북마크 수, 그룹1/그룹2 각각 몇 건 성공/스킵 + 새로 부여된 카테고리 목록 짧게 요약.

## 제약

- 그룹 1(완전 0태그)은 재시도해도 안 되는 게 정상인 케이스가 많음(로그인 화면·개인 워킹 문서 등) — 강제 분류 금지.
- 기존 tags의 다른 정보 유지, 대분류만 새로 채움(게임명 등 소분류 백필은 `game-tag-backfill` 스킬 영역 — 중복 안 함).
- API 키는 `front/.env`에서만 읽고 대화 컨텍스트에 노출 금지.

## 향후 확장 (필요해지면 참조, 지금은 미구현)

브레인스토밍 단계에서 나왔지만 지금 규모(개인 프로젝트, 사용자 소수)엔 과함(YAGNI)으로 보류한 옵션.
반복적으로 미분류가 계속 쌓여 수동 호출로 안 감당되면 이 순서로 검토:

1. **프롬프트 버전 자동 재처리** — `bookmarks`에 `tagged_prompt_version` 컬럼 추가, `SYSTEM_PROMPT`에 버전 번호 부여,
   프롬프트 갱신 시 구버전으로 태깅된 행을 자동 큐잉해 재처리. 스키마 변경 + 트리거/큐 인프라 필요 — 지금은 이 스킬
   수동 호출로 충분해서 보류.
2. **UI 일괄 재분류 버튼** — 사이드바 "미분류" 카테고리에 "재분류 시도" 버튼 추가, 이 스킬의 로직을 백엔드 라우트로
   승격해 사용자가 직접 트리거. 새 API 라우트 + UI 필요 — 사용자가 이 문제를 반복적으로 겪을 때 격상 고려.
