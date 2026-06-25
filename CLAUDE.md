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

## 핵심 결정 사항

- **별도 서버 없음**: API는 `front/app/api/` Route Handler로 처리. Vercel 서버리스 배포.
- **태스크 ID 체계**: A1~A16 (front), A17~A25 (extension). `tasks/README.md` 참조.
- **환경변수**: `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`는 `NEXT_PUBLIC_` 접두어 금지 — 서버사이드 전용.
- **embedding 컬럼**: API 응답에 절대 포함하지 않음.
- **본문(content)**: DB 저장 금지. OpenAI 처리 후 즉시 파기. 로그 마스킹 필수.
