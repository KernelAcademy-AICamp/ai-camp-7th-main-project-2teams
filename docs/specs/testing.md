# 테스트 전략

**연계**: `docs/specs/automation.md` §3 오케스트레이터 / §5 hooks / §7 추가 인프라
**원칙**: 순수 로직 우선, 외부 호출(OpenAI/Supabase)은 모킹. 비용 0.

---

## 1. 스택

| 도구 | 용도 | 비고 |
|------|------|------|
| **Vitest** | 유닛 + Route Handler 통합 | ESM/Next 16 친화, 단일 러너 |
| **MSW** | OpenAI/Supabase fetch 모킹 | 실제 호출·비용 차단 |
| `@testing-library/react` | 컴포넌트 (v1.1) | MVP 스킵 |

> 익스텐션: `chrome` API는 수동 mock 객체 + Vitest. 별도 프레임워크 없음.

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

## 3. 파이프라인 4지점 게이트

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
```

---

## 4. 커버리지 기준

| 범위 | 기준 |
|------|------|
| 순수 로직 (`lib/`, 파서, 유틸) | 80% |
| Route Handler | 핵심 경로(성공/인증실패/검증실패) |
| UI 컴포넌트 | 비강제 (v1.1) |
| 전체 | 비강제 (게이트는 순수 로직만) |

---

## 5. TDD 적용 범위

| 대상 | 방식 |
|------|------|
| 파서·마스킹·매핑 등 순수 로직 | 테스트 먼저 (빨강→초록) 권장 |
| Route Handler | 구현 후 통합 테스트 |
| UI 컴포넌트 | MVP 스킵, v1.1 |

---

## 6. 디렉토리 / 설정

```
front/
├── lib/
│   └── __tests__/           # 유닛 (마스킹, 매핑, 스키마)
├── app/api/
│   └── **/__tests__/        # Route Handler 통합
├── __fixtures__/
│   └── bookmarks.html       # A29 파서 샘플 (크롬 export 형식)
├── test/
│   └── msw-handlers.ts      # OpenAI/Supabase mock 핸들러
└── vitest.config.ts         # environment: node(API) / jsdom(컴포넌트) 분리

extension/
└── **/__tests__/            # chrome mock + 핸들러
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

---

## 7. 모킹 규칙

- **OpenAI**: MSW로 `api.openai.com` 가로채기. 고정 tags/embedding 반환. 실제 키·호출 금지.
- **Supabase**: MSW 또는 client mock. RLS는 통합 테스트 범위 밖(DB 정책은 수동 검증).
- **chrome.\***: `globalThis.chrome` 수동 mock (`storage.local`, `runtime.sendMessage`).
- **content 데이터**: 테스트 픽스처도 마스킹 대상 — 로그 출력 검증 시 평문 노출 없는지 확인.
