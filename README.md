[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/ERWdZ46N)

# 북마크 AI 관리 서비스

AI Camp 7기 메인 프로젝트 (2팀).

브라우저 익스텐션 + 웹앱으로 북마크에 AI 자동 태그·카테고리를 부여하고 자연어 검색을 제공하는 개인 지식 관리 도구.

---

## 기술 스택

| 레이어     | 기술                                   |
| ---------- | -------------------------------------- |
| 웹앱 + API | Next.js 16 App Router (Route Handlers) |
| 익스텐션   | Chrome Extension Manifest V3           |
| 인증       | Supabase Auth + Google OAuth 전용      |
| DB         | PostgreSQL + pgvector 0.7+ (Supabase)  |
| AI 태깅    | OpenAI `gpt-4o-mini`                   |
| AI 임베딩  | OpenAI `text-embedding-3-small`        |
| 호스팅     | Vercel (웹앱) + Supabase (DB/Auth)     |

---

## 프로젝트 구조

```
front/              # Next.js 웹앱 + API Route Handlers
  app/
    api/            # Route Handlers (별도 서버 없음)
      bookmarks/
      search/
      account/
    (dashboard)/    # 인증 필요 페이지
    login/          # Google OAuth 버튼
    auth/callback/  # OAuth 콜백 핸들러
    privacy/
    terms/
  tasks.json        # 웹앱 태스크 A1~A16

extension/          # Chrome Extension
  manifest.json
  background/
  popup/
  content/
  tasks.json        # 익스텐션 태스크 A17~A25

docs/
  specs/            # 기술 스펙 (database, extension, nextjs-supabase, openai, shadcn)

scripts/
  prd.md            # PRD v0.2

tasks/
  README.md         # 전체 태스크 인덱스 (A1~A25)
```

---

## 관련 문서

| 문서                  | 경로                            |
| --------------------- | ------------------------------- |
| PRD                   | `scripts/prd.md`                |
| 전체 태스크           | `tasks/README.md`               |
| 웹앱 태스크           | `front/tasks.json`              |
| 익스텐션 태스크       | `extension/tasks.json`          |
| DB 스펙               | `docs/specs/database.md`        |
| Extension 스펙        | `docs/specs/extension.md`       |
| Next.js·Supabase 스펙 | `docs/specs/nextjs-supabase.md` |
| OpenAI 스펙           | `docs/specs/openai.md`          |
| shadcn/ui 스펙        | `docs/specs/shadcn.md`          |
