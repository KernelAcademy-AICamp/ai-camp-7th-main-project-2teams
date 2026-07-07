---
name: game-tag-backfill
description: 게임 카테고리 북마크 중 게임명 소분류 태그가 없는 것을 찾아 AI 재태깅으로 채운다. 주기적으로 사용자가 직접 호출.
---

# 게임명 태그 백필

## 배경

`lib/ai.ts` SYSTEM_PROMPT는 게임 카테고리에서 게임명 식별 가능 시 소분류 필수 포함하도록 규칙 강화됨(신규 저장분부터 적용).
이전에 저장된 게임 카테고리 북마크는 이 규칙 이전에 태깅되어 게임명 태그가 빠져 있을 수 있음 — 재태깅 필요.

## 실행 순서

1. **대상 조회**: Supabase(`mcp__supabase__execute_sql`)로 게임 카테고리(`categories.name = '게임'`) 북마크 중 title이
   구체적 게임명을 담고 있을 가능성이 있는데 tags 배열에 그 게임명이 없는 것을 조회.
   ```sql
   select b.id, b.title, b.url, b.tags
   from bookmarks b
   join categories c on c.id = b.category_id
   where c.name = '게임'
   order by b.created_at;
   ```

2. **재태깅 판단**: 각 row의 title/url을 보고 게임명이 식별 가능한지 모델 판단으로 확인.
   이미 tags에 그 게임명이 포함돼 있으면 스킵 — 순수 누락분만 대상.

3. **태그 재생성**: 누락 대상에 대해 `generateTags({ title, url })` 호출(스크립트로, 실제 OpenAI 키 사용) —
   title/url만으로 빈 태그 나오면, `lib/fetchMeta.ts`의 `fetchMeta(url)`로 description 재fetch 후
   `generateTags({ title, url, description })`로 1회 재시도(저장 시점과 동일 로직 재사용, 새 코드 불필요).
   재시도까지 빈 태그면 억지 태깅 금지 원칙대로 스킵(옛 링크 썩음·meta 빈약 등 정상 스킵 케이스).
   찾아낸 태그는 기존 tags를 지우지 않고 새로 식별된 게임명만 배열에 추가(중복 방지). embedding은 title 불변이면 재계산 불필요.

4. **DB 갱신**: 대상 row의 `tags` 컬럼만 update. `content`/`embedding` 컬럼 건드리지 않음.

5. **보고**: 갱신된 북마크 수 + 추가된 게임명 목록 짧게 요약.

## 제약

- 게임 카테고리 북마크만 대상 — 다른 카테고리 재태깅 안 함(스코프 밖).
- 기존 tags 배열의 다른 태그(공략 등)는 유지, 게임명만 추가.
- 신뢰도 낮아 게임명 특정 못 하면(시리즈만 언급되고 특정 불가 등) 건드리지 않음 — 억지 태깅 금지 원칙 동일 적용.
- API 키·서비스 롤 키는 `front/.env`에서만 읽고 대화 컨텍스트에 노출 금지.
