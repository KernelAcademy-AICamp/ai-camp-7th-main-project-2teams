---
description: "Playwright MCP로 docs/specs/e2e/*.md 시나리오를 구동"
---

# /e2e

`docs/specs/e2e/*.md` 시나리오를 Playwright MCP `browser_*` 도구로 실행한다. 스크립트(`*.spec.ts`) 아님 — 시나리오 MD 기반.

## 프로세스

1. 대상 결정: 인자 없으면 `docs/specs/e2e/` 전체, 있으면 해당 시나리오
2. 대상 URL 확보: Vercel preview URL (PR) 또는 로컬 dev 서버
3. 각 시나리오 MD의 스텝을 순서대로 구동
   - `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type` 등
4. 통과 기준 검증
   - 각 스텝 `browser_snapshot`으로 요소 존재
   - `browser_console_messages` 에러 0
   - `browser_network_requests`에 embedding 등 민감 필드 노출 없음
5. 시나리오별 PASS/FAIL 보고

## 규칙

- preview/로컬 서버 없으면 실행 불가 → 안내 후 종료
- 익스텐션 E2E는 MCP 범위 밖 (수동 검증)
- 상세 형식: `docs/specs/testing.md` §4
