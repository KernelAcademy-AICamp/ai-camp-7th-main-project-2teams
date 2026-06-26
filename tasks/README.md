# Tasks

MVP v1.0 태스크 — PRD `scripts/prd.md` 기반 (v0.5, IA 정리본 반영)

## 구조

```
front/tasks.json       # Next.js 웹앱 + API Routes (A1~A16, A26~A31)
extension/tasks.json   # Chrome Extension (A17~A25)
tasks/README.md        # 이 파일
```

> `server/` 디렉토리 없음. API Route Handler는 `front/app/api/` 안에 통합.

---

## 태스크 목록

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
| A11 | 사이드바 (전체/즐겨찾기/카테고리 드롭다운/내 폴더 드롭다운 + 필터) | medium | 기능 | 수정 |
| A12 | 개인정보처리방침 페이지 (/privacy)                        | high     | 법적   |      |
| A13 | 이용약관 페이지 (/terms)                                  | high     | 법적   |      |
| A14 | DELETE /api/account — 회원 탈퇴 + 데이터 파기             | high     | 법적   |      |
| A15 | GET /api/account/data — 개인정보 열람 API                 | medium   | 법적   |      |
| A16 | 회원 탈퇴 UI + 데이터 파기 플로우                         | medium   | 법적   |      |
| A26 | 온보딩 페이지 (`/onboarding` — 별도 화면, 익스텐션 설치 안내 + 첫 저장 유도 + 데모 GIF) | high | 기능 | 수정 |
| A27 | PATCH /api/bookmarks/:id — 즐겨찾기 토글 API             | medium   | 기능   | 신규 |
| A28 | 즐겨찾기 UI (카드 버튼 + 사이드바 탭 연동)               | medium   | 기능   | 신규 |
| A29 | POST /api/bookmarks/import — 파일 임포트 API (HTML 파싱 + 배치 태깅) | high | 기능 | 신규 |
| A30 | 파일 임포트 UI (WEB-14 — 드래그앤드롭 + 선택 파일 정보 + 진행 상황 + 상태 분기) | high | 기능 | 신규 |
| A31 | 사이드바 내 폴더 탭 (folder_hint 기반 드롭다운, 파일 임포트 시만 노출) | medium | 기능 | 신규 |

> A30 헤더 버튼("파일 업로드")과 URL 직접 추가 모달("북마크 추가")은 A9 작업 시 헤더 컴포넌트에 함께 포함.

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
    ├── A15 (GET /api/account/data)
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
