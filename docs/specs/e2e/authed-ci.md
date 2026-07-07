# Authed e2e (nightly CI) 셋업

인증 플로우 e2e를 CI에서 돌리기 위한 사전 준비. **PR 게이트 아님** — `.github/workflows/e2e-authed.yml` (매일 야간 + 수동 `workflow_dispatch`).

공개 페이지 e2e(PR 게이트, `--project=public`)와 분리. flaky·외부 의존이 PR 머지를 막지 않게 하기 위함.

## 동작 구조

- `e2e/authed/auth.setup.ts` — 테스트 Supabase에 테스트 유저(email+password) 보장 → 비번 로그인으로 세션 발급 → `@supabase/ssr`로 쿠키 수확 → `e2e/.auth/state.json` 저장. 온보딩 자동 리다이렉트 우회용 `onboarding_done_{userId}` localStorage도 주입.
- `e2e/authed/*.spec.ts` — 위 storageState 재사용(`--project=authed`).
- OpenAI는 `E2E_MOCK_OPENAI=1`로 목(`lib/ai.ts`) — 비용·지연·flaky 제거. `createEmbedding`은 상수 벡터 → 저장·쿼리 임베딩 일치(검색 결정적).

## 필요 준비

### 1. 테스트 전용 Supabase 프로젝트 (필수)

⚠️ 운영/개발 DB 사용 금지 — setup이 테스트 유저 북마크를 매 실행 `delete`함. 데이터 오염.

- 별도 Supabase 프로젝트 생성
- `front/supabase/` 마이그레이션(스키마 + `match_bookmarks` RPC + RLS) 적용
- pgvector 확장 활성화

### 2. GitHub Secrets (저장소 Settings → Secrets and variables → Actions)

| Secret | 값 |
| --- | --- |
| `E2E_SUPABASE_URL` | 테스트 프로젝트 URL |
| `E2E_SUPABASE_ANON_KEY` | 테스트 프로젝트 anon key |
| `E2E_SUPABASE_SERVICE_ROLE_KEY` | 테스트 프로젝트 service role key |
| `E2E_TEST_EMAIL` | 테스트 유저 이메일 (선택, 기본 `e2e-bot@example.com`) |
| `E2E_TEST_PASSWORD` | 테스트 유저 비번 (선택, 기본값 있음) |

### 3. Variable (활성화 스위치)

| Variable | 값 |
| --- | --- |
| `E2E_AUTHED_ENABLED` | `true` (미설정 시 워크플로 잡 스킵) |

## 로컬 실행

```bash
cd front
E2E_MOCK_OPENAI=1 \
NEXT_PUBLIC_SUPABASE_URL=<test-url> \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<test-anon> \
SUPABASE_SERVICE_ROLE_KEY=<test-service> \
npm run test:e2e:authed
```

⚠️ 로컬도 가리키는 Supabase의 테스트 유저 데이터를 비우므로 **테스트 프로젝트로만** 실행.

## 커버 범위

- `dashboard.spec.ts` — 세션 주입 + 온보딩 우회 검증(하네스 유효성)
- `import.spec.ts` — HTML 임포트 → 배치 태깅/임베딩(목) → 결과

## 미커버 (후속)

- 저장→검색 루프: 웹앱엔 북마크 추가 UI 없음(익스텐션 전용). 검색 e2e는 setup에서 직접 시드 후 추가 가능.
- 로그인 UI 자체: Google/Kakao OAuth는 CI 자동화 불가 → 세션 주입으로 대체.
