# Tasks

MVP v1.0 태스크 — PRD `scripts/prd.md` 기반

## 구조

```
front/tasks.json       # Next.js 웹앱 + API Routes (A1~A16)
extension/tasks.json   # Chrome Extension (A17~A25)
tasks/README.md        # 이 파일
```

> `server/` 디렉토리 없음. API Route Handler는 `front/app/api/` 안에 통합.

---

## 태스크 목록

### Web App + API Routes — front/ (A1~A16)

| ID  | 제목                                          | 우선순위 | 구분   |
| --- | --------------------------------------------- | -------- | ------ |
| A1  | Supabase DB 스키마 + pgvector 설정            | high     | 인프라 |
| A2  | Next.js 16 App Router 프로젝트 셋업           | high     | 인프라 |
| A3  | 인증 미들웨어 withAuth()                      | high     | 인프라 |
| A4  | 회원가입 + 로그인 페이지                      | high     | 기능   |
| A5  | POST /api/bookmarks — 저장 + AI 태깅 + 임베딩 | high     | 기능   |
| A6  | GET /api/bookmarks — 목록 조회 + 필터         | high     | 기능   |
| A7  | POST /api/search — 자연어 벡터 검색           | high     | 기능   |
| A8  | OpenAI ZDR + 본문 미저장 보장                 | high     | 법적   |
| A9  | 북마크 목록 페이지 (홈)                       | high     | 기능   |
| A10 | 자연어 검색 UI                                | high     | 기능   |
| A11 | 사이드바 태그/카테고리 필터                   | medium   | 기능   |
| A12 | 개인정보처리방침 페이지 (/privacy)            | high     | 법적   |
| A13 | 이용약관 페이지 (/terms)                      | high     | 법적   |
| A14 | DELETE /api/account — 회원 탈퇴 + 데이터 파기 | high     | 법적   |
| A15 | GET /api/account/data — 개인정보 열람 API     | medium   | 법적   |
| A16 | 회원 탈퇴 UI + 데이터 파기 플로우             | medium   | 법적   |

### Chrome Extension — extension/ (A17~A25)

| ID  | 제목                                     | 우선순위 | 구분   |
| --- | ---------------------------------------- | -------- | ------ |
| A17 | Manifest V3 기본 구조 셋업               | high     | 인프라 |
| A18 | Supabase Auth 연동 (chrome.storage 기반) | high     | 기능   |
| A19 | 로그인 UI — 웹앱 탭 연동                 | high     | 기능   |
| A20 | 현재 탭 정보 수집                        | high     | 기능   |
| A21 | 북마크 저장 — POST /api/bookmarks        | high     | 기능   |
| A22 | 저장 완료 토스트 표시                    | medium   | 기능   |
| A23 | 최소 권한 원칙 검증 (manifest.json)      | high     | 법적   |
| A24 | 로그아웃·탈퇴 시 로컬 데이터 파기        | high     | 법적   |
| A25 | Chrome 웹스토어 Privacy Practices 작성   | high     | 법적   |

---

## 의존 관계

```
A1 (DB 스키마) ──── A2 (Next.js 셋업)
│                   │
└── A3 (withAuth)   └── A4 (로그인/회원가입)
    ├── A5 (POST /api/bookmarks) → A8 (ZDR + 본문 미저장)
    ├── A6 (GET /api/bookmarks)
    ├── A7 (POST /api/search)
    ├── A14 (DELETE /api/account)
    └── A15 (GET /api/account/data)

A4 ──────────────── A9 (북마크 목록)
                    ├── A10 (검색 UI) ← A7
                    └── A11 (필터 사이드바) ← A6

A2 ─┬── A12 (/privacy)
    └── A13 (/terms)

A4 + A14 ────────── A16 (탈퇴 UI)

A17 (Extension 셋업)
├── A18 (Auth) ─── A19 (로그인 연동) ← A4
│                └── A21 (저장 요청) ← A5, A20
│                    └── A22 (토스트)
│                └── A24 (로컬 파기) ← A14
├── A20 (탭 정보 수집)
├── A23 (최소 권한 검증)
└── A25 (Privacy Practices)
```

---

## 구현 순서

```
1단계 (인프라):     A1, A2 병렬 → A3, A17 병렬
2단계 (핵심 API):   A5, A6, A7 병렬 (A3 완료 후)
3단계 (컴플라이언스): A8 (A5 완료 후), A12, A13, A23, A25 병렬
4단계 (웹앱 UI):    A4 → A9 → A10, A11 병렬
5단계 (Extension):  A18 (A17 완료) → A20 병렬 → A19, A21 → A22
6단계 (탈퇴 플로우): A14 → A15, A16, A24 병렬
```

---

## 법적 대응 매핑

| 법령 조항                 | 대응 태스크   |
| ------------------------- | ------------- |
| 개보법 15조 (수집 동의)   | A4            |
| 개보법 21조 (잊힐 권리)   | A14, A16, A24 |
| 개보법 28조의8 (국외이전) | A4, A12       |
| 개보법 29조 (안전조치)    | A23           |
| 개보법 30조 (처리방침)    | A12           |
| 개보법 35조 (열람권)      | A15           |
| 저작권법 (본문 미저장)    | A8, A13       |
| Chrome 웹스토어 심사      | A23, A25      |
