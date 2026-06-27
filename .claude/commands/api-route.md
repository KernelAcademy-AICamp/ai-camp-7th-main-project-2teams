---
description: "Route Handler 스캐폴드 생성 (withAuth + Zod + supabase, 보일러플레이트)"
---

# /api-route

`front/app/api/` Route Handler를 패턴에 맞춰 스캐폴드한다. 인자: 경로 + 메서드 (예: `bookmarks POST`).

## 프로세스

1. `.claude/rules/api-patterns.md` 보일러플레이트 로드
2. `docs/specs/nextjs-supabase.md`에서 해당 Zod 스키마/인터페이스 확인
3. 파일 생성: `front/app/api/<경로>/route.ts`
   - `withAuth` HOF + Zod `safeParse` + 명시 컬럼 select(embedding 제외)
4. 테스트 스텁 생성: `front/app/api/<경로>/__tests__/route.test.ts`
   - 성공 / 401(미인증) / 400(검증실패) / embedding 미포함
5. 보안 체크 (`.claude/rules/security.md`) 적용 안내

## 규칙

- `select('*')` 금지 — 명시 컬럼
- 서버 전용 키만, content 로그 금지
- front 미스캐폴드면 생성만 하고 "vitest 미실행" 안내
