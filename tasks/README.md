# Tasks

MVP v1.0 태스크 — PRD `scripts/prd.md` 기반 (v0.5, IA 정리본 반영)

## 구조

```
front/tasks.json       # Next.js 웹앱 + API Routes (A1~A16, A26~A64, A51 삭제됨)
extension/tasks.json   # Chrome Extension (A17~A25)
tasks/README.md        # 이 파일 (진행 현황 포함)
```

> `server/` 디렉토리 없음. API Route Handler는 `front/app/api/` 안에 통합.

---

## 진행 현황

> 태스크 완료 시 체크박스 업데이트 필수 (`[x]`로 변경 + `tasks.json` status: done).

### Web App + API Routes — front/ (A1~A16, A26~A31)

- [x] A1: Supabase DB 스키마 + pgvector 설정
- [x] A2: Next.js 16 App Router 프로젝트 셋업
- [x] A3: 인증 미들웨어 withAuth()
- [x] A4: Google OAuth 로그인 페이지
- [x] A5: POST /api/bookmarks — 저장 + AI 태깅 + 임베딩
- [x] A6: GET /api/bookmarks — 목록 조회 + 필터 (즐겨찾기 포함)
- [x] A7: POST /api/search — 자연어 벡터 검색
- [x] A8: OpenAI ZDR + 본문 미저장 보장
- [x] A9: 북마크 목록 페이지 (홈)
- [x] A10: 자연어 검색 UI
- [x] A11: 사이드바 태그/카테고리 필터
- [x] A12: 개인정보처리방침 페이지 (/privacy)
- [x] A13: 이용약관 페이지 (/terms)
- [x] A14: DELETE /api/account — 회원 탈퇴 + 데이터 파기
- [x] A15: GET /api/account — 개인정보 열람 API
- [x] A16: 회원 탈퇴 UI + 데이터 파기 플로우
- [x] A26: 온보딩 페이지 (/onboarding)
- [x] A27: PATCH /api/bookmarks/:id — 즐겨찾기 토글 API
- [x] A28: 즐겨찾기 UI
- [x] A29: POST /api/bookmarks/import — 파일 임포트 API
- [x] A30: 파일 임포트 UI
- [x] A31: 사이드바 내 폴더 탭
- [x] A39: 랜딩 페이지 (/welcome) + 온보딩 가이드 헤더 버튼
- [x] A40: 헤더 단건 URL 북마크 추가 팝업
- [x] A41: 북마크 카드 메뉴 → 단건 삭제 UI
- [x] A42: 프로필 팝업 + 로그아웃
- [x] A50: 컴팩트 뷰 추가 (뷰 3종 전환) — IA v0.7

### Chrome Extension — extension/ (A17~A25)

- [x] A17: Manifest V3 기본 구조 셋업
- [x] A18: Supabase Auth 연동 (chrome.storage 기반)
- [x] A19: 로그인 UI — 웹앱 탭 연동
- [x] A20: 현재 탭 정보 수집
- [x] A21: 북마크 저장 — POST /api/bookmarks
- [x] A22: 저장 완료 토스트 (태그 미리보기 포함)
- [x] A23: 최소 권한 원칙 검증 (manifest.json)
- [x] A24: 로그아웃·탈퇴 시 로컬 데이터 파기
- [x] A25: Chrome 웹스토어 Privacy Practices 작성

**진행률: 25 / 25 완료 (MVP 범위 A1~A25 기준) · IA 갭 추가 A39~A42 (4/4 완료) · IA v0.7 추가 A50 (1/1 완료)**

---

## 태스크 상세

### Web App + API Routes — front/ (A1~A16, A26~A31)

| ID  | 제목                                                      | 우선순위 | 구분   | 변경 |
| --- | --------------------------------------------------------- | -------- | ------ | ---- |
| A1  | Supabase DB 스키마 + pgvector 설정                        | high     | 인프라 |      |
| A2  | Next.js 16 App Router 프로젝트 셋업                       | high     | 인프라 |      |
| A3  | 인증 미들웨어 withAuth()                                  | high     | 인프라 |      |
| A4  | Google OAuth 로그인 페이지                                | high     | 기능   |      |
| A5  | POST /api/bookmarks — 저장 + AI 태깅 + 임베딩             | high     | 기능   |      |
| A6  | GET /api/bookmarks — 목록 조회 + 필터 (즐겨찾기 포함)     | high     | 기능   | 수정 |
| A7  | POST /api/search — 자연어 벡터 검색                       | high     | 기능   |      |
| A8  | OpenAI ZDR + 본문 미저장 보장                             | high     | 법적   |      |
| A9  | 북마크 목록 페이지 (홈 — 리스트/그리드 뷰 + 정렬)        | high     | 기능   | 수정 |
| A10 | 자연어 검색 UI (최대 50자 + 최근 검색 MVP)               | high     | 기능   | 수정 |
| A11 | 사이드바 (전체/즐겨찾기/카테고리 + 필터)                 | medium   | 기능   | 수정 |
| A12 | 개인정보처리방침 페이지 (/privacy)                        | high     | 법적   |      |
| A13 | 이용약관 페이지 (/terms)                                  | high     | 법적   |      |
| A14 | DELETE /api/account — 회원 탈퇴 + 데이터 파기             | high     | 법적   |      |
| A15 | GET /api/account — 개인정보 열람 API                      | medium   | 법적   |      |
| A16 | 회원 탈퇴 UI + 데이터 파기 플로우                         | medium   | 법적   |      |
| A26 | 온보딩 페이지 (/onboarding)                               | high     | 기능   | 수정 |
| A27 | PATCH /api/bookmarks/:id — 즐겨찾기 토글 API             | medium   | 기능   | 신규 |
| A28 | 즐겨찾기 UI (카드 버튼 + 사이드바 탭 연동)               | medium   | 기능   | 신규 |
| A29 | POST /api/bookmarks/import — 파일 임포트 API              | high     | 기능   | 신규 |
| A30 | 파일 임포트 UI                                            | high     | 기능   | 신규 |
| A31 | 사이드바 내 폴더 탭 (folder_hint 기반)                   | medium   | 기능   | 신규 |
| A39 | 랜딩 페이지 (/welcome) + 온보딩 가이드 헤더 버튼         | medium   | 기능   | 신규 |
| A40 | 헤더 단건 URL 북마크 추가 팝업                            | high     | 기능   | 신규 |
| A41 | 북마크 카드 메뉴 → 단건 삭제 UI                          | medium   | 기능   | 신규 |
| A42 | 프로필 팝업 + 로그아웃                                    | medium   | 기능   | 신규 |
| A50 | 컴팩트 뷰 추가 (뷰 3종 전환)                             | medium   | 기능   | 신규 |

### Chrome Extension — extension/ (A17~A25)

| ID  | 제목                                     | 우선순위 | 구분   | 변경 |
| --- | ---------------------------------------- | -------- | ------ | ---- |
| A17 | Manifest V3 기본 구조 셋업               | high     | 인프라 |      |
| A18 | Supabase Auth 연동 (chrome.storage 기반) | high     | 기능   |      |
| A19 | 로그인 UI — 웹앱 탭 연동                 | high     | 기능   |      |
| A20 | 현재 탭 정보 수집                        | high     | 기능   |      |
| A21 | 북마크 저장 — POST /api/bookmarks        | high     | 기능   |      |
| A22 | 저장 완료 토스트 (태그 미리보기 포함)    | medium   | 기능   | 수정 |
| A23 | 최소 권한 원칙 검증 (manifest.json)      | high     | 법적   |      |
| A24 | 로그아웃·탈퇴 시 로컬 데이터 파기        | high     | 법적   |      |
| A25 | Chrome 웹스토어 Privacy Practices 작성   | high     | 법적   |      |

---

## 의존 관계

```
A1 (DB 스키마) ──── A2 (Next.js 셋업)
│                   │
└── A3 (withAuth)   └── A4 (로그인)
    ├── A5 (POST /api/bookmarks) → A8 (ZDR + 본문 미저장)
    ├── A6 (GET /api/bookmarks)
    ├── A7 (POST /api/search)
    ├── A14 (DELETE /api/account)
    ├── A15 (GET /api/account)
    ├── A27 (PATCH /api/bookmarks/:id 즐겨찾기)
    └── A29 (POST /api/bookmarks/import)

A4 ──────────────── A26 (온보딩 페이지) → A9 (북마크 목록)
                                           ├── A10 (검색 UI) ← A7
                                           ├── A11 (사이드바 필터) ← A6
                                           └── A28 (즐겨찾기 UI) ← A27
                         A30 (임포트 UI) ← A29
                                            └── A31 (내 폴더 탭) ← A11 (사이드바)

A2 ─┬── A12 (/privacy)
    └── A13 (/terms)

A4 + A14 ────────── A16 (탈퇴 UI)

A17 (Extension 셋업)
├── A18 (Auth) ─── A19 (로그인 연동) ← A4
│                └── A21 (저장 요청) ← A5, A20
│                    └── A22 (토스트 + 태그 미리보기)
│                └── A24 (로컬 파기) ← A14
├── A20 (탭 정보 수집)
├── A23 (최소 권한 검증)
└── A25 (Privacy Practices)
```

---

## 구현 순서

```
1단계 (인프라):       A1, A2 병렬 → A3, A17 병렬
2단계 (핵심 API):     A5, A6, A7, A27, A29 병렬 (A3 완료 후)
3단계 (컴플라이언스): A8 (A5 완료 후), A12, A13, A23, A25 병렬
4단계 (웹앱 UI):      A4 → A26 → A9 → A10, A11, A28, A30 병렬 → A31 (A29, A30 완료 후)
5단계 (Extension):    A18 (A17 완료) → A20 병렬 → A19, A21 → A22
6단계 (탈퇴 플로우):  A14 → A15, A16, A24 병렬
```

---

## 알려진 이슈 / 백로그

> 파이프라인 재검토(2026-06-28)에서 식별. MVP 범위 외 또는 후속 처리.

### 배포 차단급

- [x] **WEB_APP_URL 하드코딩** — esbuild define으로 빌드 타임 치환 처리. `WEB_APP_URL`/`SUPABASE_URL`/`SUPABASE_ANON_KEY` 환경변수 주입, 미설정 시 localhost fallback.
- [x] **A48 로그인 직후 /welcome 튕김** (`lib/supabase/client.ts`): `createClient()`가 호출마다 새 `createBrowserClient`(GoTrueClient) 생성 → 대시보드 mount 시 onboarding effect·`Sidebar`·`ExtensionSync` 동시 호출로 다중 인스턴스가 단일사용 refresh token 회전을 레이스 → 세션 무효화 → 네비게이션에서 middleware `getUser()` null → `/welcome`. 브라우저 클라이언트 모듈 레벨 싱글톤화로 수정.

### 데이터/정합성

- [x] **A32 account DELETE 비원자성** (`app/api/account/route.ts`): `deleteUser` 단일 호출 + `ON DELETE CASCADE` 위임으로 원자적 처리. PR #48.
- [x] **A33 경로 드리프트**: `tasks/README.md`, `front/tasks.json` A15 title을 실제 구현 경로(`GET /api/account`)로 수정. `docs/specs/nextjs-supabase.md`는 이미 정합.
- [x] **A34 maskSensitive 미연결** (A8): `lib/logger.ts` 정의됐으나 route 어디서도 호출 안 됨. 에러 로깅 추가 시 경유 가드 없음.
- [x] **A35 URL 중복 저장 무방비**: `(user_id, url)` UNIQUE 제약 + canonical URL 정규화. 중복 시 AI 호출 전 409 선검사(조용한 덮어쓰기 제거), 경합은 unique 위반 catch로 409. PR #52.

### 검색 품질 (튜닝)

- [x] **A36 비대칭 임베딩 + threshold 0.5 하드코딩** (`app/api/search/route.ts`): 저장 doc=title+content(김) vs 쿼리=짧은 자연어 → cosine 낮아 recall 누락 가능. 운영 데이터로 threshold 튜닝.
- [x] **A37 빈 content 약한 벡터**: `logger.warn('[weak-vector]')` 로 모니터링 추가. content 없으면 title 단독 임베딩. PR #54.
- [x] **A54 자연어 검색 하이브리드 (pgvector + pg_trgm)**: 순수 벡터는 정확 단어 매칭 취약 → 한글 부분 문자열 매칭에 tsvector보다 적합한 pg_trgm과 RRF 병합. `match_bookmarks` RPC 재작성(`supabase/migrations/0009_hybrid_search.sql`), route.ts에 `query_text` 파라미터 추가. GraphRAG 도입 안 함(북마크=단일 홉 시맨틱 검색, 서버리스·content 미저장 제약과 충돌, 2026-07 판단).
- [x] **A55 검색 메타데이터 필터 (카테고리)**: `match_bookmarks`에 `p_category_id`/`p_uncategorized` 파라미터 추가 — 현재 선택된 카테고리(사이드바 상태) 안에서만 검색. `supabase/migrations/0010_search_category_filter.sql`, `/api/search` route·`useSearch` 훅·`page.tsx handleSearch` 연동. tags/is_favorite 필터는 미포함(요청 범위 밖) — 필요 시 후속.

### 태깅 품질 (튜닝)

- [x] **A43 confidence 필터 + 골든셋 평가** (`lib/ai.ts`, `lib/tag-eval.ts`): generateTags가 태그별 confidence 반환, threshold 0.6 미만 자동 제외. alias 보강·Few-shot 반례로 RAG 과태깅 교정. 골든셋(`eval/tag-golden.json`, n=115) 실측 macro-F1 0.85·대분류 정확도 0.93(2026-07), 회귀 게이트 baseline 0.82(`RUN_TAG_EVAL=1`, 실측 0.85 대비 여유). PR #87.
- [x] **A44 골든셋 확장 스킬** (`.claude/skills/golden-set-expand/`): tag-golden.json 안전 확장 스킬. few-shot leak·대분류 정책 위반·중분류 vocab 드리프트·URL 중복을 `validate_golden.py`로 차단. 대분류 6→9 확장 과정에서 반복된 오류를 코드화.
- [x] **A52 임포트 태깅 입력 보강** (`app/api/bookmarks/import/route.ts`): 임포트가 `generateTags({ title, url })`만 호출 — description 굶김이 실사용 태깅 품질 저하의 주원인. fetchMeta를 임포트에 적용(청크 동시성 5, description 즉시 파기), 임베딩도 title+description 결합. 실측: 골든셋 macro-F1 +0.039 회복. PR #155.
- [x] **A53 골든셋 입력조건별 평가** (`lib/__tests__/tag-eval.test.ts`): 러너를 rich/title-only 2패스로 확장, train/serve skew 정량. title-only 회귀 게이트 baseline 0.77(실측 0.799). PR #155. 이월: 실 임포트 수준 지저분 title 표본 확충(실데이터 필요) — 현 skew −0.039는 하한.

### Minor

- [x] **A38 중복 normalize** (`app/api/bookmarks/route.ts`): `resolveTopCategory`가 정규화된 태그를 입력받도록 변경, 단건·임포트 라우트에서 `tags` 재사용. rawTags 2회 정규화 제거.
- [x] **A45 폴더 목록 하위 폴더 누락** (`app/api/bookmarks/folders/route.ts`, A31 후속): `folder_hint[0]`만 집계하던 `extractTopFolders` → 전체 depth 집계 `extractFolders`로 변경. 사이드바 '내 폴더'에 하위 폴더 노출. 필터는 `contains()`로 이미 전체 depth 매칭. PR #107.
- [x] **A46 폴더 트리 사이드바** (`lib/folderTree.ts`, `components/Sidebar.tsx`, A31·A45 후속): `folder_hint` 경로를 `buildFolderTree`로 계층 트리화, folders API에 트리용 `paths` 응답 추가. 크롬 기본 폴더(북마크바·기타 북마크 등)는 `parseNetscapeBookmarks`·표시에서 제외. 트리 노드 기본 접힘, nav·main 독립 스크롤. PR #109.
- [x] **A47 미분류 버킷 + 사이드바 스켈레톤** (`app/api/bookmarks/route.ts`, `components/Sidebar.tsx`, `components/SidebarSkeleton.tsx`): 고정 12개 대분류 외·`tags=[]` 북마크를 '미분류'로 묶음(`category=미분류` → `category_id IS NULL`). 사이드바 로딩 중 `SidebarSkeleton` 노출로 pop-in 깜빡임 제거. `aggregateCategories` 순수 함수 추출(raw `tags[0]` 노출 버그 수정). PR #111.
- [x] **A49 프로필 팝업 미표시** (`components/Sidebar.tsx`, A46 회귀): nav `overflow-y-auto`가 x축도 클리핑 → 팝업이 `left-full`로 사이드바 폭 밖에 렌더되어 잘림. `bottom-full left-0 right-0 mb-2 z-10`으로 폭 안·행 위 배치.
- [x] **A56 즐겨찾기 탭 카테고리 리스트 미생성·미갱신** (`components/Sidebar.tsx`, A11·A28 후속): 즐겨찾기 탭 진입 시 카테고리 하위 리스트를 통째로 숨기던 회귀. `categories` API에 `is_favorite` 필터 추가, `useCategories(tab)`이 즐겨찾기 기준 집계 요청, `useToggleFavorite` onSettled에서 `categories` 쿼리도 invalidate(refetch 없이 즉시 반영). PR #171.
- [x] **A57 extractTopCategory 대분류 토큰 중복 잔존** (`lib/tag-alias.ts`, A43 후속): `normalizeTags` 표준화로 대분류 토큰이 배열에 2회 이상 등장할 수 있는데 첫 매치 인덱스 하나만 제거해 나머지가 중분류(midTags)에 남던 버그. `TOP_CATEGORIES` 소속 토큰 전부 필터링으로 수정. PR #172.

---

## MVP v1.1 (PRD 8장 — 출시 후 4~6주)

> PRD `scripts/prd.md` "제외 (v1.1로 이월)" 항목 기준. 우선순위: 이미 절반 구현된 항목·저비용 고가치 우선, 대시보드(A64)는 프리미엄 게이팅 선행 필요해 최하위.

### 진행 현황

- [x] A58: 자연어 검색 + 태그/즐겨찾기 필터 조합 (high)
- [x] A59: 중복 북마크 경고 UI (high)
- [ ] A60: 태그/카테고리 사용자 직접 편집 + 카드 수정 (high)
- [x] A61: 파일 임포트 고도화 (medium)
- [x] A62: 대량 북마크 페이지네이션 개선 (medium)
- [x] A63: 카카오 소셜 로그인 (medium)
- [ ] A64: 개인 북마크 대시보드 — 프리미엄 전용 (low)

**진행률: 5 / 7 완료**

### 태스크 상세

| ID  | 제목                                       | 우선순위 | 상태    | 근거 / 잔여 작업                                             |
| --- | ------------------------------------------ | -------- | ------- | ------------------------------------------------------------- |
| A58 | 검색 + 태그/즐겨찾기 필터 조합            | high     | done    | PR #177. match_bookmarks에 p_tags/p_is_favorite 추가.          |
| A59 | 중복 북마크 경고 UI                       | high     | done    | PR #178. 안내 문구만(이동 링크 없음), 웹앱+익스텐션 둘 다.      |
| A60 | 태그·카테고리 편집 + 카드 수정            | high     | pending | description 컬럼(0013 마이그레이션)만 추가된 상태. 편집 UI 없음. |
| A61 | 파일 임포트 고도화                        | medium   | done    | PR #179. 실패 항목 상세 리스트(URL+사유)까지. 문제 보고는 스코프 제외. |
| A62 | 대량 북마크 페이지네이션 개선             | medium   | done    | PR #182. 목록은 서버 페이지네이션(useInfiniteQuery), 검색은 top-60 클라이언트 슬라이스. |
| A63 | 카카오 소셜 로그인                         | medium   | done    | PR #181. Supabase 네이티브 프로바이더 확인(커스텀 OIDC 아님), Google과 동일 패턴. 네이버 스코프 제외. |
| A64 | 개인 북마크 대시보드 (프리미엄)           | low      | pending | 프리미엄 게이팅 인프라 부재. 스코프 최대.                      |

### 의존 관계

```
A55 (검색 카테고리 필터) ── A58 (태그/즐겨찾기 필터 조합)
A35 (dedup 409) ────────── A59 (중복 경고 UI)
A27 + A41 + A43 ────────── A60 (태그/카테고리 편집 + 카드 수정) ── A64 (대시보드)
A29 + A30 + A52 ────────── A61 (임포트 고도화)
A6 + A9 ────────────────── A62 (페이지네이션) ┐
A6 ──────────────────────────────────────────┴─ A64 (대시보드)
A4 + A19 ────────────────── A63 (소셜 로그인)
```

### 우선순위 순서 (구현 권장 순서)

```
1순위 (저비용·고가치, 기존 구현 위 확장): A58, A59
2순위 (핵심 기능 갭 해소):                 A60
3순위 (UX 개선):                           A61, A62
4순위 (신규 인프라 필요):                   A63
5순위 (선행 인프라 의존, 스코프 최대):      A64
```

---

## 법적 대응 매핑

| 법령 조항                 | 대응 태스크      |
| ------------------------- | ---------------- |
| 개보법 15조 (수집 동의)   | A4               |
| 개보법 21조 (잊힐 권리)   | A14, A16, A24    |
| 개보법 28조의8 (국외이전) | A4, A12          |
| 개보법 29조 (안전조치)    | A23              |
| 개보법 30조 (처리방침)    | A12              |
| 개보법 35조 (열람권)      | A15              |
| 저작권법 (본문 미저장)    | A8, A13, A29     |
| Chrome 웹스토어 심사      | A23, A25         |
