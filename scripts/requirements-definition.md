# 요구사항정의서 — 북마크 AI 관리 서비스

**버전**: v1.0
**작성일**: 2026-07-09
**범위**: MVP(v1.0, A1~A25) + v1.1(A58~A65) — 구현 완료 기준. v2.0(AI 요약, Firefox, 팀/공유, 프리미엄 구독)은 범위 제외.

---

## 1. 문서 개요

### 1.1 목적

`scripts/prd.md`(PRD)는 "왜/무엇을 만드는가"를 다루지만, 요구사항ID 기반 추적성·화면/데이터/인터페이스 요구사항 구조화·유스케이스 시나리오(정상/예외 흐름)는 별도로 정리돼 있지 않다. 본 문서는 PRD·태스크 현황·기술 스펙·실제 구현 코드를 원천으로 하여, 이미 구현 완료된 MVP+v1.1 범위의 요구사항을 문서화하고 추적성을 확보한다.

### 1.2 범위

| 포함                     | 제외                                                            |
| ------------------------ | --------------------------------------------------------------- |
| MVP(v1.0): A1~A25        | v2.0: AI 요약 생성                                              |
| v1.1: A58~A65 (A64 제외) | v2.0: Firefox 익스텐션                                          |
|                          | v2.0: 팀/공유 기능(B2B)                                         |
|                          | v2.0: 프리미엄 구독 결제                                        |
|                          | A64: 개인 북마크 대시보드(프리미엄) — 게이팅 인프라 부재로 보류 |

### 1.3 용어 정의

| 용어        | 정의                                                                     |
| ----------- | ------------------------------------------------------------------------ |
| 대분류      | 북마크 최상위 주제 분류 13종. `categories` 테이블에 유저별로 자동 생성   |
| 중/소분류   | 대분류 하위 세부 태그. `bookmarks.tags` 배열에 저장                      |
| 미분류      | `tags=[]` 이거나 대분류 13종 밖 주제일 때 `category_id=NULL`             |
| 임베딩      | `text-embedding-3-small`로 생성한 1536차원 벡터. 자연어 검색에 사용      |
| ZDR         | OpenAI Zero Data Retention — 본문 원문 미저장·즉시 파기 정책             |
| folder_hint | 파일 임포트 시 원본 브라우저 폴더 경로 보존 배열 (category_id와 별개)    |
| RRF         | Reciprocal Rank Fusion — 벡터 검색과 트라이그램 검색 결과 병합 방식(A54) |

### 1.4 참고 문서

| 문서                                | 경로                                                |
| ----------------------------------- | --------------------------------------------------- |
| PRD                                 | `scripts/prd.md`                                    |
| 태스크 현황/의존관계/법적 대응 매핑 | `tasks/README.md`                                   |
| DB 스펙                             | `docs/specs/database.md`                            |
| Next.js/Supabase 통합 스펙          | `docs/specs/nextjs-supabase.md`                     |
| 익스텐션 스펙                       | `docs/specs/extension.md`                           |
| 태그 분류체계                       | `docs/specs/tag-taxonomy.md`, `docs/specs/alias.md` |
| 보안 규칙                           | `.claude/rules/security.md`                         |
| API/메시지 패턴                     | `.claude/rules/api-patterns.md`                     |

---

## 2. 이해관계자 및 페르소나

### 2.1 주요 타겟 (PRD §5)

| 페르소나        | 특성                                                           |
| --------------- | -------------------------------------------------------------- |
| 지식노동자      | 개발자·디자이너·리서처 — 하루 10개 이상 링크 저장, 재검색 빈번 |
| 콘텐츠 큐레이터 | 뉴스레터 발행자·블로거 — 리서치 소스 관리가 핵심 업무          |
| 학생·연구자     | 논문·아티클 저장 후 논거 탐색 용도                             |

### 2.2 얼리 어답터 / 제외 타겟

- 얼리 어답터: Chrome 익스텐션 사용 개발자/디자이너(한국 30~40대), Notion/Obsidian PKM 사용자, 북마크 100개 이상 "저장 강박" 사용자
- 제외 타겟: 모바일 우선 사용자, Safari/Firefox 전용 사용자(MVP는 Chrome 전용), 팀 단위 공유 목적 사용자(v2 이후)

### 2.3 내부 이해관계자

| 역할              | 관심사                                             |
| ----------------- | -------------------------------------------------- |
| PM                | OKR 달성(MAU 500, 7일 리텐션 30%, NPS 30)          |
| 개발              | 기술 실현 가능성, 응답시간(1.5초) 준수             |
| 법무/컴플라이언스 | 개인정보보호법·저작권법 대응, Chrome 웹스토어 심사 |

---

## 3. 기능 요구사항 (REQ-F)

| ID       | 기능                 | 설명                                                                                                       | 우선순위 | 태스크ID          | 상태                                                 |
| -------- | -------------------- | ---------------------------------------------------------------------------------------------------------- | -------- | ----------------- | ---------------------------------------------------- |
| REQ-F-01 | AI 자동 태깅         | 저장 시 본문 앞 2000자를 GPT-4o-mini에 전달, 태그 0~3개(confidence≥0.6) + 카테고리 1개(대→중→소 계층) 생성 | high     | A5, A43           | done                                                 |
| REQ-F-02 | 자연어 검색          | 쿼리 임베딩 → pgvector cosine + pg_trgm RRF 하이브리드 검색, 카테고리/태그/즐겨찾기 필터 조합              | high     | A7, A54, A55, A58 | done                                                 |
| REQ-F-03 | 즐겨찾기             | 카드 버튼으로 토글, 사이드바 즐겨찾기 탭 필터                                                              | medium   | A27, A28          | done                                                 |
| REQ-F-04 | 파일 임포트          | 브라우저 북마크 HTML·카카오톡 CSV 업로드 → AI 태깅 자동 적용, 진행률/결과 분기 표시                        | high     | A29, A30, A61     | done                                                 |
| REQ-F-05 | 죽은 링크 감지       | 저장 시점 URL 상태코드(HEAD→GET 폴백) 확인, 404/410만 `is_dead` 플래그, 카드 배지 표시                     | medium   | A21(연계)         | done                                                 |
| REQ-F-06 | 북마크 편집/삭제     | 태그·카테고리·설명 직접 수정(재임베딩 트리거), 카드 메뉴 단건 삭제                                         | high     | A41, A60          | done                                                 |
| REQ-F-07 | 중복 URL 처리        | `(user_id, url)` UNIQUE + upsert, AI 호출 전 409 선검사, 저장 전 경고 UI                                   | high     | A35, A59          | done                                                 |
| REQ-F-08 | 내보내기/재임포트    | HTML/CSV 내보내기, 자체 포맷 왕복 재임포트 시 재태깅 생략                                                  | medium   | A65               | done                                                 |
| REQ-F-09 | OAuth 인증           | Google(필수) + Kakao(Supabase 네이티브 프로바이더) 로그인, 익스텐션-웹앱 세션 연동                         | high     | A4, A18, A19, A63 | done                                                 |
| REQ-F-10 | 온보딩/랜딩          | 비로그인 랜딩(`/welcome`), 신규가입 온보딩(`/onboarding`), 헤더 '사용법' 재진입                            | medium   | A26, A39          | done                                                 |
| REQ-F-11 | 개인정보/계정관리    | 개인정보처리방침·이용약관 페이지, 개인정보 열람 API, 회원탈퇴(원자적 삭제+로컬 데이터 파기)                | high     | A12~A16, A24, A32 | done                                                 |
| REQ-F-12 | 개인 북마크 대시보드 | 카테고리 분포·활동 추이·태그클라우드·도메인 TOP5·히트맵 (프리미엄 전용)                                    | low      | A64               | **pending** — 프리미엄 게이팅 인프라 부재, v2.0 이월 |

---

## 4. 비기능 요구사항 (REQ-NF)

| ID        | 구분        | 요구사항                                                                                     |
| --------- | ----------- | -------------------------------------------------------------------------------------------- |
| REQ-NF-01 | 성능        | 저장 → 태그 생성 평균 응답시간 1.5초 이하 (KR2)                                              |
| REQ-NF-02 | 성능        | 벡터 검색: HNSW 인덱스(m=16, ef_construction=64)로 대규모 데이터에서도 밀리초 단위 응답      |
| REQ-NF-03 | 보안        | API 응답에 `embedding` 컬럼 절대 미포함 (명시적 컬럼 select, `select('*')` 금지)             |
| REQ-NF-04 | 보안        | `content`(본문) DB 저장·로그 금지 — OpenAI 처리 후 즉시 파기                                 |
| REQ-NF-05 | 보안        | `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`에 `NEXT_PUBLIC_` 접두어 금지 — 서버사이드 전용 |
| REQ-NF-06 | 보안        | 전 테이블 RLS 적용 — `user_id = auth.uid()` 기준 본인 데이터만 접근                          |
| REQ-NF-07 | 보안        | Route Handler는 `withAuth` HOF + Zod `safeParse` 입력 검증 필수                              |
| REQ-NF-08 | 법적        | 개인정보보호법 15/21/28의8/29/30/35조 대응 (근거: 태스크 A4, A12, A14~A16, A23, A24)         |
| REQ-NF-09 | 법적        | 저작권법 대응 — 본문 미저장 정책 (A8, A13, A29)                                              |
| REQ-NF-10 | 정책        | Chrome 웹스토어 심사 — Manifest V3, 최소 권한 원칙, Privacy Practices 작성 (A23, A25)        |
| REQ-NF-11 | 언어        | 한국어/영어 혼용 콘텐츠 태깅 품질 지원                                                       |
| REQ-NF-12 | 품질 게이트 | 태깅 골든셋(n=115) macro-F1 baseline 0.82 이상 유지 (`RUN_TAG_EVAL=1`), 실측 0.85            |

---

## 5. 시스템 개요 및 기술스택

| 레이어     | 기술                               | 버전   |
| ---------- | ---------------------------------- | ------ |
| 익스텐션   | Chrome Extension Manifest V3       | -      |
| 웹앱       | Next.js App Router                 | 16.x   |
| 인증       | Supabase Auth + Google/Kakao OAuth | 최신   |
| DB         | PostgreSQL + pgvector              | 0.7+   |
| 클라이언트 | Supabase JS Client                 | 2.x    |
| AI 태깅    | OpenAI gpt-4o-mini                 | latest |
| AI 임베딩  | OpenAI text-embedding-3-small      | latest |
| 호스팅     | Vercel(웹앱) + Supabase(DB/Auth)   | -      |

별도 백엔드 서버 없음 — API는 `front/app/api/` Route Handler로 처리, Vercel 서버리스 배포.

---

## 6. 화면 요구사항 (REQ-UI)

| ID     | 화면                             | 핵심 구성                                                                                              | 버전 |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------ | ---- |
| SCR-01 | 웹앱 메인(홈)                    | 헤더(로고/사용법/파일업로드/북마크추가) + 사이드바 + 카드 목록                                         | MVP  |
| SCR-02 | 사이드바                         | 전체북마크·즐겨찾기·카테고리(드롭다운, '미분류' 고정 포함)·내 폴더(계층 트리)·회원정보                 | MVP  |
| SCR-03 | 북마크 카드                      | 파비콘·카테고리뱃지·title(2줄 말줄임)·domain·태그칩(최대3)·저장일시·즐겨찾기버튼·링크끊김배지·메뉴버튼 | MVP  |
| SCR-04 | 익스텐션 팝업                    | 비로그인(OAuth버튼) / 로그인후(저장버튼, Cmd+Shift+S) / 저장완료(토스트 3초, 태그 미리보기)            | MVP  |
| SCR-05 | 파일 임포트 페이지               | 소스선택 → 드래그앤드롭 업로드 → 검증 → 진행률바 → 완료/실패/부분완료 분기                             | MVP  |
| SCR-06 | 랜딩 페이지(`/welcome`)          | 서비스 소개 3섹션 + 인증상태별 CTA 분기                                                                | MVP  |
| SCR-07 | 온보딩 페이지(`/onboarding`)     | 익스텐션 설치 안내 + 첫 북마크 저장 유도(데모 GIF)                                                     | MVP  |
| SCR-08 | 북마크 추가 모달                 | URL 입력(validation) + 추가/닫기 버튼                                                                  | MVP  |
| SCR-09 | 프로필 모달                      | 프로필정보·설정·로그아웃                                                                               | MVP  |
| SCR-10 | 편집 모달                        | 태그/카테고리/설명 직접 수정                                                                           | v1.1 |
| SCR-11 | 개인정보처리방침/이용약관 페이지 | `/privacy`, `/terms`                                                                                   | MVP  |

카드 뷰 3종(그리드 default·리스트·컴팩트) 전환, 정렬(최신순 default·유사도순) 공통 적용 — REQ-UI 전체에 횡단 적용.

---

## 7. 데이터 요구사항

### 7.1 핵심 테이블

**`bookmarks`**: `id, user_id(FK→auth.users, CASCADE), title, url, tags TEXT[], category_id(FK→categories, nullable), folder_hint TEXT[](nullable), is_favorite, is_dead, embedding vector(1536), description(nullable, A60 사용자 편집), thumbnail_url(nullable), created_at`

**`categories`**: `id, user_id(FK→auth.users, CASCADE), name` — `UNIQUE(user_id, name)`. 유저별 개인 카테고리, 전역 시드 없음. `tags[0]` 기준 자동 생성.

> `content`(본문) 컬럼 없음 — 정책적으로 저장하지 않음(REQ-NF-04).

### 7.2 인덱스

HNSW 인덱스(`bookmarks_embedding_idx`, cosine ops, m=16/ef_construction=64) + GIN 트라이그램 인덱스(`bookmarks_title_trgm_idx`, pg_trgm) — 하이브리드 검색(REQ-F-02) 지원.

### 7.3 RLS

`bookmarks`, `categories` 양쪽 모두 SELECT/INSERT/UPDATE/DELETE 정책이 `user_id = auth.uid()` 기준으로 적용 (REQ-NF-06).

### 7.4 검색 RPC

`match_bookmarks(query_embedding, query_text, match_threshold, match_count, p_user_id, p_category_id, p_uncategorized, p_tags, p_is_favorite)` — 벡터 유사도 + 트라이그램 유사도를 RRF로 병합, `embedding` 컬럼은 반환하지 않음 (REQ-NF-03 준수).

---

## 8. 인터페이스 요구사항

### 8.1 API 라우트 (`front/app/api/`)

| 라우트                      | 메서드 | 기능                              | 관련 REQ           |
| --------------------------- | ------ | --------------------------------- | ------------------ |
| `/api/bookmarks`            | POST   | 저장 + AI 태깅 + 임베딩           | REQ-F-01           |
| `/api/bookmarks`            | GET    | 목록 조회 + 필터                  | REQ-F-02, REQ-F-03 |
| `/api/bookmarks/[id]`       | PATCH  | 즐겨찾기·태그·카테고리·설명 수정  | REQ-F-03, REQ-F-06 |
| `/api/bookmarks/import`     | POST   | HTML/카카오톡 CSV 임포트          | REQ-F-04           |
| `/api/bookmarks/folders`    | GET    | 내 폴더 목록                      | SCR-02             |
| `/api/bookmarks/categories` | GET    | 카테고리 목록(즐겨찾기 필터 포함) | SCR-02             |
| `/api/bookmarks/preview`    | GET    | 링크 미리보기 메타                | REQ-F-05(연계)     |
| `/api/search`               | POST   | 자연어 벡터 검색                  | REQ-F-02           |
| `/api/account`              | GET    | 개인정보 열람                     | REQ-F-11           |
| `/api/account`              | DELETE | 회원 탈퇴 + 원자적 데이터 파기    | REQ-F-11           |
| `/api/thumbnail`            | GET    | 썸네일 조회                       | SCR-03             |

모든 라우트는 `withAuth` HOF 경유(REQ-NF-07), 응답은 명시적 컬럼 select(REQ-NF-03).

### 8.2 익스텐션 메시지 패턴 (MV3)

`{ type, payload }` 형태, `chrome.runtime.onMessage` + async 핸들러는 `return true`로 채널 유지. 토큰은 `chrome.storage.local`에만 저장, 서버 키는 익스텐션에 미포함 (REQ-NF-05).

### 8.3 외부 연동

| 연동 대상                     | 용도                          |
| ----------------------------- | ----------------------------- |
| OpenAI gpt-4o-mini            | 태그/카테고리 생성 (ZDR 정책) |
| OpenAI text-embedding-3-small | 벡터 임베딩 생성              |
| Supabase Auth                 | Google/Kakao OAuth, 세션 관리 |

---

## 9. 시나리오 (유스케이스)

### SC-01 비로그인 방문

- **액터**: 비로그인 방문자
- **사전조건**: 없음
- **기본흐름**: 1) `/welcome` 진입 → 2) 서비스 소개 3섹션 노출(ServiceFeatures) → 3) 서버 인증상태 확인 → 4) 비로그인이므로 로그인 페이지로 CTA
- **관련**: REQ-F-10, SCR-06

### SC-02 신규가입 온보딩

- **액터**: 신규 사용자
- **사전조건**: 미가입 상태
- **기본흐름**: 1) Google/Kakao OAuth 로그인 완료 → 2) `/onboarding` 진입, 익스텐션 설치 안내(Chrome 웹스토어 링크) → 3) 데모 GIF로 첫 저장 유도 → 4) 첫 북마크 저장 완료 시 메인화면 이동(Aha 모멘트)
- **대안흐름**: 헤더 '사용법' 버튼으로 안내 모달 재진입 가능
- **관련**: REQ-F-09, REQ-F-10, SCR-07

### SC-03 익스텐션 북마크 저장

- **액터**: 로그인 사용자
- **사전조건**: 익스텐션 설치·로그인 완료
- **기본흐름**: 1) Cmd+Shift+S 또는 팝업 버튼 클릭 → 2) 현재 탭 제목/URL/본문 앞 2000자 수집 → 3) `POST /api/bookmarks` 전송 → 4) 서버가 GPT-4o-mini로 태그 0~3개+카테고리 1개 생성, text-embedding-3-small로 임베딩 생성, Supabase 저장(원문 미저장) → 5) 팝업에 "저장됨+태그" 토스트(~1.5초)
- **예외흐름**: 태깅 실패(`tags=[]`) → `category_id NULL` → 사이드바 '미분류'로 표시. 동일 URL 이미 존재 → AI 호출 전 409 응답, 저장 전 경고 UI 노출(REQ-F-07)
- **사후조건**: `bookmarks` 1건 생성, `categories` upsert
- **관련**: REQ-F-01, REQ-F-07, SCR-04

### SC-04 웹앱 URL 직접 추가

- **액터**: 로그인 사용자
- **기본흐름**: 1) 헤더 "북마크 추가" 클릭 → 2) URL 입력 모달(형식 validation) → 3) "추가" 클릭 → `POST /api/bookmarks` → 4) SC-03과 동일 AI 처리
- **관련**: REQ-F-01, SCR-08

### SC-05 자연어 검색

- **액터**: 로그인 사용자
- **기본흐름**: 1) 검색창에 자연어 입력(최대 50자) → 2) `POST /api/search` → 3) 쿼리 임베딩 변환 → 4) pgvector+pg_trgm RRF 하이브리드 검색(유사도 임계값 0.5 이상, 상위 20건) → 5) 제목/URL/태그/카테고리/유사도 반환 → 6) 클릭 시 원본 페이지 이동
- **예외흐름**: 결과 0건 시 빈 상태 표시. 50자 초과 입력은 클라이언트에서 제한
- **관련**: REQ-F-02, REQ-NF-02

### SC-06 필터 조합 탐색

- **액터**: 로그인 사용자
- **기본흐름**: 1) 사이드바에서 카테고리/즐겨찾기/전체 탭 선택 → 2) 자연어 검색 동시 입력 시 태그·즐겨찾기 필터와 조합(`p_tags`, `p_is_favorite`) → 3) 정렬(최신순/유사도순), 뷰 전환(그리드/리스트/컴팩트) 적용
- **관련**: REQ-F-02, REQ-F-03, SCR-02

### SC-07 파일 임포트

- **액터**: 로그인 사용자
- **기본흐름**: 1) 헤더 "파일 업로드" → 2) 소스 선택(브라우저 HTML / 카카오톡 CSV) → 3) 드래그앤드롭 또는 파일 선택 업로드 → 4) 파일 검증(스피너) → 5) 업로드 진행(프로그레스바, 취소 가능) → 6) AI 태깅 처리(진행 개수 표시)
- **대안흐름**: 완료 시 3분기 — 성공(완료 메시지+홈 이동) / 실패(에러+재시도) / 부분완료(경고+실패 목록 URL·사유)
- **관련**: REQ-F-04, SCR-05

### SC-08 북마크 편집·삭제

- **액터**: 로그인 사용자
- **기본흐름**: 1) 카드 메뉴 버튼 → 모달 → 2) 삭제 선택 시 즉시 삭제, 또는 3) 수정 선택 시 태그/카테고리/설명 편집 → `PATCH /api/bookmarks/[id]`
- **예외흐름**: 설명 변경 시 재임베딩 트리거, 카테고리 변경 시 클라이언트 캐시 필터 불일치 방지(낙관적 업데이트 무효화)
- **관련**: REQ-F-06, SCR-10

### SC-09 죽은 링크 감지

- **액터**: 시스템(저장 시점 자동 실행)
- **기본흐름**: 1) 저장 시 URL 상태코드 확인(HEAD 우선, 실패 시 GET 폴백) → 2) 404/410이면 `is_dead=true` → 3) 카드에 "링크 끊김" 배지(앰버톤) 표시
- **예외흐름**: 403/429/5xx/timeout은 죽은 링크로 판정하지 않음(사이트 생존 가능성). 저장 전 경고는 비차단 — 그대로 저장 가능
- **관련**: REQ-F-05, SCR-03

### SC-10 내보내기 → 재임포트 왕복 복원

- **액터**: 로그인 사용자
- **기본흐름**: 1) 계정 설정에서 HTML/CSV 내보내기 → 2) 자체 포맷(TAGS/DATA_CATEGORY 인코딩) 파일 재업로드 → 3) 임포트 라우트가 TAGS 존재 시 재태깅 생략, DATA_CATEGORY는 `resolveTopCategory`로 검증만 수행
- **관련**: REQ-F-08

### SC-11 개인정보 열람 / 회원탈퇴

- **액터**: 로그인 사용자
- **기본흐름(열람)**: 1) 프로필 모달 → 설정 → 2) `GET /api/account`로 본인 데이터 열람
- **기본흐름(탈퇴)**: 1) 탈퇴 버튼 클릭 → 2) `DELETE /api/account` → 3) `bookmarks` 삭제 → `auth.admin.deleteUser` 원자적 처리(CASCADE) → 4) 익스텐션 로그아웃 시 로컬 데이터 파기(chrome.storage.local)
- **관련**: REQ-F-11, REQ-NF-08

---

## 10. 추적성 매트릭스

| REQ-ID   | 태스크ID           | 관련 PR    | 상태        | 비고                                   |
| -------- | ------------------ | ---------- | ----------- | -------------------------------------- |
| REQ-F-01 | A5, A43, A52, A53  | #87, #155  | done        | 골든셋 macro-F1 0.85, baseline 0.82    |
| REQ-F-02 | A7, A54, A55, A58  | #177       | done¹       | ¹아래 각주 참조                        |
| REQ-F-03 | A27, A28, A56      | #171       | done        |                                        |
| REQ-F-04 | A29, A30, A52, A61 | #155, #179 | done        |                                        |
| REQ-F-05 | A21(연계)          | -          | done        | 마이그레이션 0021                      |
| REQ-F-06 | A41, A60           | -          | done        |                                        |
| REQ-F-07 | A35, A59           | #52, #178  | done        |                                        |
| REQ-F-08 | A65                | -          | done        |                                        |
| REQ-F-09 | A4, A18, A19, A63  | #181       | done        |                                        |
| REQ-F-10 | A26, A39           | -          | done        |                                        |
| REQ-F-11 | A12~A16, A24, A32  | #48        | done        |                                        |
| REQ-F-12 | A64                | -          | **pending** | 프리미엄 게이팅 인프라 부재, v2.0 이월 |

> ¹ **각주**: `front/tasks.json` raw 데이터에는 A54(하이브리드 검색)·A55(카테고리 필터)가 `status: pending`으로 남아있어 `tasks/README.md` 서술(완료)과 불일치했으나, `front/app/api/search/route.ts`(파라미터 `query_text`, `p_category_id`, `p_uncategorized`, `p_tags`, `p_is_favorite` 확인) 및 `supabase/migrations/0009_hybrid_search.sql`, `0010_search_category_filter.sql` 실존을 코드 레벨로 교차검증해 done으로 확정. **2026-07-09 `front/tasks.json` status 필드도 done으로 갱신 완료**, 문서-코드-트래커 3자 정합 확보.

---

## 11. 미해결/보류 항목 및 다음 버전

| 항목                                                        | 사유                                                                                                       | 예정                         |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------- |
| REQ-F-12 개인 북마크 대시보드(A64)                          | 프리미엄 게이팅 인프라 부재                                                                                | v2.0                         |
| 백그라운드 job 기반 임포트 진행률(Redis)                    | `docs/specs/import-progress-background-jobs.md`에 "미구현, 향후 옵션"으로 명시, 현재 폴링/동기 처리로 충분 | 검토 대상 (트리거 조건 미정) |
| AI 요약 생성, Firefox 익스텐션, 팀/공유 기능, 프리미엄 구독 | PRD §8 v2.0 로드맵 — 본 문서 범위 제외                                                                     | v2.0                         |
