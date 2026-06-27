# 테스트 전략

**연계**: `docs/specs/automation.md` §3 오케스트레이터 / §5 hooks / §7 추가 인프라
**원칙**: 순수 로직 우선, 외부 호출(OpenAI/Supabase)은 모킹. 비용 0.

---

## 1. 스택

| 도구 | 용도 | 비고 |
|------|------|------|
| **Vitest** | 유닛 + Route Handler 통합 (`*.test.ts`) | ESM/Next 16 친화, 단일 러너 |
| **MSW** | OpenAI/Supabase fetch 모킹 | 실제 호출·비용 차단 |
| **Playwright MCP** | E2E 브라우저 시나리오 (Claude 구동) | 스크립트 아님, 시나리오 MD 기반 |
| `@testing-library/react` | 컴포넌트 (v1.1) | MVP 스킵 |

> 익스텐션: `chrome` API는 수동 mock 객체 + Vitest. 별도 프레임워크 없음.

### 2계층 구조

```
유닛/통합 (Vitest)   → 테스트 케이스 .ts 파일, 스크립트, CI 실행
E2E (Playwright MCP) → 시나리오 MD, Claude가 browser_* 도구로 구동
```

---

## 2. 테스트 대상 (태스크별)

순수 함수가 1순위. 외부 의존 없는 로직부터.

| 태스크 | 대상 | 유형 | 우선 |
|--------|------|------|------|
| A29 | HTML 북마크 파서 (folder_hint 추출, 크롬 기본 폴더 제거) | 유닛 | ★ |
| A8 | content 마스킹 유틸 | 유닛 | ★보안 |
| A5 | tags[0] → category_id 매핑 | 유닛 | 높음 |
| A7 | 유사도 임계값(0.5) 필터 | 유닛 | 높음 |
| A5, A7 | Zod 스키마 경계값 (`bookmarkSchema`, `searchSchema`) | 유닛 | 높음 |
| A31 | folder_hint distinct 추출 | 유닛 | 중 |
| A5, A6, A27 | Route Handler (MSW로 supabase/openai mock) | 통합 | 높음 |
| A6, A7 | 응답에 `embedding` 미포함 검증 | 통합 | ★보안 |
| A18 | chrome.storage 어댑터 | 유닛 | 중 |
| A21 | 저장 메시지 핸들러 | 유닛 | 중 |

> embedding 미포함 테스트 = security-auditor와 이중 방어.

---

## 3. 테스트 케이스 파일 규칙 (Vitest)

### 네이밍

| 파일 | 위치 | 대상 |
|------|------|------|
| `<모듈>.test.ts` | 대상 코드 옆 `__tests__/` | 유닛 (순수 함수) |
| `route.test.ts` | `app/api/**/__tests__/` | Route Handler 통합 |

### 케이스 구조 (AAA 패턴)

`describe`(대상) → `it`(케이스, 한국어) → Arrange/Act/Assert.

```ts
// front/lib/__tests__/maskContent.test.ts  (A8)
import { describe, it, expect } from 'vitest'
import { maskContent } from '../maskContent'

describe('maskContent — 본문 로그 마스킹', () => {
  it('평문 본문을 마스킹 처리한다', () => {
    // Arrange
    const raw = '비밀 토큰 abc123 포함된 본문'
    // Act
    const masked = maskContent(raw)
    // Assert
    expect(masked).not.toContain('abc123')
    expect(masked).toMatch(/\*+/)
  })

  it('빈 문자열은 그대로 반환한다', () => {
    expect(maskContent('')).toBe('')
  })
})
```

```ts
// front/lib/__tests__/parseBookmarks.test.ts  (A29)
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseBookmarks } from '../parseBookmarks'

describe('parseBookmarks — 크롬 HTML 임포트', () => {
  const html = readFileSync('front/__fixtures__/bookmarks.html', 'utf-8')

  it('크롬 기본 폴더(북마크 바)를 folder_hint에서 제거한다', () => {
    const result = parseBookmarks(html)
    expect(result[0].folder_hint).not.toContain('북마크 바')
  })

  it('중첩 폴더 경로를 배열로 보존한다', () => {
    const result = parseBookmarks(html)
    const dev = result.find((b) => b.title.includes('React'))
    expect(dev?.folder_hint).toEqual(['개발', '프론트엔드'])
  })
})
```

### Route Handler 통합 (MSW)

```ts
// front/app/api/bookmarks/__tests__/route.test.ts  (A5, A6)
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { server } from '@/test/msw-server'
import { POST, GET } from '../route'

beforeAll(() => server.listen())
afterAll(() => server.close())

describe('POST /api/bookmarks', () => {
  it('인증 없으면 401', async () => {
    const res = await POST(new Request('http://t/api/bookmarks', { method: 'POST' }))
    expect(res.status).toBe(401)
  })
})

describe('GET /api/bookmarks — 보안', () => {
  it('응답에 embedding 컬럼이 없다', async () => {
    const res = await GET(authedReq('http://t/api/bookmarks'))
    const { bookmarks } = await res.json()
    expect(bookmarks[0]).not.toHaveProperty('embedding')
  })
})
```

### 작성 흐름

```
1. 대상 함수 시그니처 확정 (spec 문서 기준)
2. <모듈>.test.ts 생성 — 정상/경계/실패 케이스 최소 3개
3. 순수 로직은 테스트 먼저(빨강) → 구현(초록)
4. vitest related --run 로 즉시 확인
```

---

## 4. E2E — Playwright MCP

스크립트(`*.spec.ts`) 아님. **시나리오 MD를 Claude가 `browser_*` MCP 도구로 구동**. 레이아웃 미완성·반응형 변경에 강함.

### 시나리오 위치

```
docs/specs/e2e/
├── auth.md          # 로그인 플로우
├── save-search.md   # 저장 → 검색 재발견 (핵심 가치)
└── import.md        # 파일 임포트 (WEB-14)
```

### 시나리오 작성 형식

```md
# E2E: 저장 → 검색 (save-search.md)

전제: 로그인 상태, 북마크 0건

## 스텝
1. browser_navigate → {preview_url}
2. 헤더 "북마크 추가" 클릭 → 모달 확인 (browser_snapshot)
3. URL 입력 → "추가" → 토스트 "저장됨" 확인
4. 검색창에 "리액트 훅" 입력 → 결과 1건 이상
5. 카드 클릭 → 원본 URL 이동 확인

## 통과 기준
- 각 스텝 browser_snapshot으로 요소 존재 검증
- 콘솔 에러 0 (browser_console_messages)
- embedding 등 민감 필드가 네트워크 응답에 없음 (browser_network_requests)
```

### 실행 대상 플로우 (MVP)

| 시나리오 | 검증 가치 | 태스크 |
|----------|-----------|--------|
| 로그인 | OAuth 진입 | A4, A26 |
| 저장→검색 | 핵심 재발견 루프 | A5, A7, A9, A10 |
| 파일 임포트 | 배치 처리 + 진행 UI | A29, A30 |

> 익스텐션 E2E는 MCP 범위 밖(별도 브라우저 컨텍스트). 수동 검증 + A21/A22 유닛으로 대체.

---

## 5. 파이프라인 게이트

```
① feature-builder (구현 시)
   코드 + 테스트 동시 작성. 순수 로직엔 최소 1개 runnable 체크 필수.

② 로컬 hook — PreToolUse Bash(git commit:*)
   npm run lint + vitest related --run   (변경 파일 관련만, 수초)
   실패 시 커밋 차단.

③ /dev-task 오케스트레이터 — 리뷰 직전 (step 4.5)
   vitest run (전체) → 통과해야 review/commit 진행
   실패 시 feature-builder 재dispatch (테스트 로그 전달)

④ CI — ci.yml (pull_request)
   vitest run --coverage
   머지 차단 조건 포함.

⑤ E2E — Playwright MCP (PR preview 배포 후)
   /e2e 스킬이 docs/specs/e2e/*.md 시나리오를 browser_* 도구로 구동.
   Vercel preview URL 대상. 핵심 플로우 통과해야 머지.
```

①~④ Vitest 자동, ⑤ E2E는 preview 배포 의존 → PR 단계에서만.

> **가드**: ②commit hook·④CI는 `package.json` 없으면 자동 skip(no-op). front 스캐폴드(A2) 후 자동 활성. 실제 hook: `.claude/hooks/lint-test-guard.sh`.

---

## 6. 커버리지 기준

| 범위 | 기준 |
|------|------|
| 순수 로직 (`lib/`, 파서, 유틸) | 80% |
| Route Handler | 핵심 경로(성공/인증실패/검증실패) |
| UI 컴포넌트 | 비강제 (v1.1) |
| 전체 | 비강제 (게이트는 순수 로직만) |

---

## 7. TDD 적용 범위

| 대상 | 방식 |
|------|------|
| 파서·마스킹·매핑 등 순수 로직 | 테스트 먼저 (빨강→초록) 권장 |
| Route Handler | 구현 후 통합 테스트 |
| UI 컴포넌트 | MVP 스킵, v1.1 |

---

## 8. 디렉토리 / 설정

```
front/
├── lib/
│   └── __tests__/           # 유닛 (마스킹, 매핑, 스키마) — *.test.ts
├── app/api/
│   └── **/__tests__/        # Route Handler 통합 — route.test.ts
├── __fixtures__/
│   └── bookmarks.html       # A29 파서 샘플 (크롬 export 형식)
├── test/
│   ├── msw-handlers.ts      # OpenAI/Supabase mock 핸들러
│   └── msw-server.ts        # setupServer(...handlers)
└── vitest.config.ts         # environment: node(API) / jsdom(컴포넌트) 분리

extension/
└── **/__tests__/            # chrome mock + 핸들러

docs/specs/e2e/              # Playwright MCP 시나리오 (MD)
├── auth.md
├── save-search.md
└── import.md
```

### package.json scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:cov": "vitest run --coverage"
  }
}
```

> E2E는 npm script 아님 — `/e2e` 스킬이 Playwright MCP로 시나리오 구동.

---

## 9. 모킹 규칙

- **OpenAI**: MSW로 `api.openai.com` 가로채기. 고정 tags/embedding 반환. 실제 키·호출 금지.
- **Supabase**: MSW 또는 client mock. RLS는 통합 테스트 범위 밖(DB 정책은 수동 검증).
- **chrome.\***: `globalThis.chrome` 수동 mock (`storage.local`, `runtime.sendMessage`).
- **content 데이터**: 테스트 픽스처도 마스킹 대상 — 로그 출력 검증 시 평문 노출 없는지 확인.
