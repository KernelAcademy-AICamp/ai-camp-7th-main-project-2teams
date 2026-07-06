---
name: cross-lingual-search-alias
description: 북마크 title/tags를 순회해 검색 alias 사전(front/lib/search-alias.ts)에 빠진 한/영 브랜드명 쌍을 찾아 추가한다. 주기적으로 사용자가 직접 호출.
---

# 교차언어 검색 alias 동기화

## 배경

`text-embedding-3-small`은 음차 표기(피그마)와 원어(Figma) 사이 코사인 유사도가 낮음(실측 0.09~0.44,
relevance floor 0.4 미달). `front/lib/search-alias.ts`의 `SEARCH_ALIAS` 사전이 쿼리를 원어까지 확장해
이 문제를 우회한다. 새 북마크가 쌓이면서 사전에 없는 브랜드명이 계속 생기므로 주기적으로 갱신 필요.

## 실행 순서

1. **현재 사전 읽기**: `front/lib/search-alias.ts`의 `SEARCH_ALIAS` 키/값 전체 로드.

2. **북마크 데이터 순회**: Supabase(`mcp__supabase__execute_sql`)로 다음 실행, 프로젝트 ID는
   `front/.env`의 `NEXT_PUBLIC_SUPABASE_URL`에서 추출:
   ```sql
   select distinct unnest(tags) as tag from bookmarks where tags is not null
   union
   select distinct title from bookmarks;
   ```
   (대량이면 `limit`/페이지네이션 없이 한 번에 받되, 태그는 보통 title보다 훨씬 적으므로 태그
   우선 — title은 노이즈가 많아 후순위 참고자료로만 사용)

3. **후보 추출**: tags 목록에서 영문 고유명사로 보이는 것(브랜드/툴/서비스명 — Figma, Notion,
   Slack류) 중 `SEARCH_ALIAS`에 없는 것을 스스로 판단(모델 지식으로 "이건 잘 알려진 툴/브랜드다"
   판별). 일반 명사·범용 태그(개발, 디자인 등)는 제외 — 카테고리 alias(`tag-alias.ts`) 영역이라
   중복 대상 아님.

4. **한글 음차 존재 검증**: 후보 각각에 대해 같은 사용자 북마크 title/tags 안에 대응하는 한글
   음차 표기가 실제로 있는지 확인(`title ilike '%<음차>%'` 또는 tags 배열 검색). 한쪽 언어만
   있으면 교차언어 문제 자체가 발생하지 않으므로 스킵 — 양쪽 다 존재하는 후보만 진행.

5. **실측 검증(선택, 후보 많을 때 상위 몇 개만)**: 이번 세션에서 쓴 방식대로 OpenAI 임베딩 API로
   두 표기 모두 embed 후, 배포된 `match_bookmarks` RPC를 REST로 직접 호출해 cos_sim 비교.
   `front/.env`의 `OPENAI_API_KEY`/`SUPABASE_SERVICE_ROLE_KEY`로 임시 python 스크립트 사용
   (벡터 배열을 대화 컨텍스트에 절대 Read/echo하지 말 것 — bash 프로세스 내부에서만 다루고 파일로
   저장 후 즉시 삭제). 코사인이 이미 충분히 높으면(예: >=0.5) 추가 안 해도 됨 — 실제로 안 잡히는
   케이스만 alias 추가 대상.

6. **사전 갱신**: `front/lib/search-alias.ts`의 `SEARCH_ALIAS`에 `{한글: 영문}` 추가.
   `front/lib/__tests__/search-alias.test.ts`에도 케이스 추가.

7. **검증**: `npx vitest run lib/__tests__/search-alias.test.ts app/api/search/__tests__/route.test.ts`
   실행, 전부 통과 확인.

8. **보고**: 추가한 alias 쌍 목록 + 근거(실측 코사인 있으면 같이) 짧게 요약.

## 제약

- `SEARCH_ALIAS`는 브랜드/툴명 전용. 일반 동의어·카테고리명은 `front/lib/tag-alias.ts` 영역 —
  거기 넣지 말 것.
- 이미 있는 키/값은 건드리지 않음 — 순수 추가만.
- Supabase 프로젝트에 원격 DDL 변경(migration) 필요 없음 — 이 스킬은 읽기 전용 조회 + 코드 파일
  수정만 한다.
