---
name: search-alias-backfill
description: 태그 전체를 스캔해 SEARCH_ALIAS(front/lib/search-alias.ts)에 없는 한글 음차↔영문 원어 동의어 쌍을 찾아 추가한다. 주기적으로 사용자가 직접 호출.
---

# 검색 동의어(SEARCH_ALIAS) 백필

## 배경

`front/lib/search-alias.ts`의 `SEARCH_ALIAS`는 한글 음차(피그마)와 영문 원어(Figma) 검색어를
서로 확장해주는 사전. pg_trgm은 스크립트가 다른 문자열(한글 vs 라틴)끼리 `word_similarity=0`
(공유 trigram 없음)이라 트라이그램으로 못 잡고, text-embedding-3-small도 이 교차언어 쌍을
강하게 못 묶음(실측 cos_sim 0.09~0.44, relevance floor 미달) — 사전 등록 외엔 방법 없음.

새 태그가 계속 쌓이면서(AI 자동 태깅, 사용자 수동 태깅) 사전에 없는 새 음차↔원어 쌍이 계속
발생함 — 주기적으로 스캔해 채워야 함.

## 실행 순서

1. **태그 전체 조회**: `mcp__supabase__execute_sql`로 전체 유저 distinct 태그 + 빈도 조회.
   ```sql
   SELECT tg, count(*) FROM bookmarks, unnest(tags) tg GROUP BY tg ORDER BY count(*) DESC;
   ```
   (SEARCH_ALIAS는 전 유저 공용 사전이므로 특정 user_id로 좁히지 않음.)

2. **후보 판단**: 태그 리스트를 모델 판단으로 스캔해 아래 조건 전부 만족하는 쌍만 후보로 삼음:
   - 한글 음차와 영문 원어가 **같은 대상**을 가리킴(발음 대응, 의미 번역 아님 — "노코드"/"no-code"처럼
     의역인 건 제외, "피그마"/"Figma"처럼 발음 대응만 포함)
   - 이미 `SEARCH_ALIAS`에 등록된 키/값이 아님
   - 애매하면(대상이 여러 개로 해석 가능, 예: "람다"→AWS Lambda vs 수학기호) 제외

   신뢰도 2단계로 나눠 보고:
   - **확실**: 한글·영문 두 형태 모두 실제 태그로 이미 존재(현재 데이터가 분산돼 서로 못 찾는 중인 게 증명됨)
   - **애매**: 한쪽 형태만 현재 존재하지만 잘 알려진 툴/브랜드라 향후 검색어로 나올 법함(선제 등록)

3. **사전 추가**: `front/lib/search-alias.ts`의 `SEARCH_ALIAS` 객체에 확실 등급 전부, 애매 등급은
   사용자 확인 후 추가. 한 원어에 한글 표기가 여럿이면(옵시디언/옵시디안처럼) 키를 각각 등록—
   `Record`라 여러 키가 같은 값 가리키는 것 허용.

4. **검증**: `npx vitest run lib/__tests__/search-alias.test.ts` 통과 확인.

5. **보고**: 추가된 쌍 목록 + 등급, 제외한 애매 케이스와 이유 짧게 요약.

## 제약

- DB 데이터(bookmarks.tags)는 건드리지 않음 — 코드 사전(`search-alias.ts`)만 수정, 마이그레이션 불필요.
- 의역(노코드/바이브코딩 등)은 대상 아님 — 순수 음차↔원어 발음 대응 쌍만.
- 애매 등급은 임의로 추가하지 않고 사용자 확인 받음(오탐 사전 등록 시 무관 검색 결과 유발 위험).
