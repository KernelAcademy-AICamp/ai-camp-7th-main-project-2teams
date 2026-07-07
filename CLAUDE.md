# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

AI Camp 7기 메인 프로젝트 (2팀). GitHub Classroom 과제 저장소.

북마크 AI 관리 서비스 — Chrome Extension + Next.js 웹앱. AI 자동 태깅, pgvector 자연어 검색.

## 언어 규칙

- **응답/주석/문서**: 한국어
- **변수명/함수명**: 영어

## 디렉토리 구조

```
front/       # Next.js 16 App Router (웹앱 + API Route Handlers)
extension/   # Chrome Extension Manifest V3
docs/        # 기술 스펙 문서 (specs/)
scripts/     # PRD 등 기획 문서
tasks/       # 태스크 인덱스
```

## React Hooks 규칙

- `usehooks-ts` 라이브러리 우선 사용 (`useLocalStorage`, `useDebounce`, `useMediaQuery` 등)
- 라이브러리에 없는 경우에만 `front/hooks/` 에 커스텀 훅 작성

## 태스크 완료 절차

태스크(A-id) 하나가 develop에 머지될 때마다 **반드시** 두 곳 동시 업데이트:

1. `tasks/README.md` — 해당 항목 `[ ]` → `[x]` + 진행률 숫자 갱신
2. `front/tasks.json` 또는 `extension/tasks.json` — `status: "pending"` → `"done"`

누락 시 다음 태스크 시작 전에 먼저 수정.

## 핵심 결정 사항

- **별도 서버 없음**: API는 `front/app/api/` Route Handler로 처리. Vercel 서버리스 배포.
- **태스크 ID 체계**: A1~A16 (front), A17~A25 (extension). `tasks/README.md` 참조.
- **인증**: Google, Kakao OAuth (Supabase Auth, A63). 이메일/비밀번호 로그인 없음.
- **환경변수**: `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`는 `NEXT_PUBLIC_` 접두어 금지 — 서버사이드 전용.
- **embedding 컬럼**: API 응답에 절대 포함하지 않음.
- **본문(content)**: DB 저장 금지. OpenAI 처리 후 즉시 파기. 로그 마스킹 필수.

## Next.js 16 규약

- **미들웨어 = `proxy`**: Next 16에서 `middleware` 파일 규칙 deprecated. `front/proxy.ts`에 `export function proxy()` 사용 (구 `middleware.ts` 아님). 마이그레이션: `npx @next/codemod@canary middleware-to-proxy .`
- **워크스페이스 루트**: `next.config.ts`의 `turbopack.root: __dirname`으로 `front/` 고정. 상위 디렉토리 lockfile로 인한 루트 오추론 경고 방지 — 제거 금지.
