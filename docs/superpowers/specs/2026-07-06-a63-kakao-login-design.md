# A63 카카오 소셜 로그인 설계

- 날짜: 2026-07-06
- 대상: `front/app/login/page.tsx`, Supabase Dashboard 설정(코드 아님), 개인정보처리방침(A12) 문서
- tasks.json: A63 (`front/tasks.json`), 우선순위 medium — 네이버는 스코프 제외(확정)

## 배경

기존 tasks.json/PRD는 "카카오는 커스텀 OIDC 연동 필요"라고 가정했으나, Supabase 공식 문서 확인 결과 **틀린 가정**이었다. Supabase Auth는 Kakao를 Google/GitHub와 동급의 **네이티브 OAuth 프로바이더**로 지원한다(`provider: 'kakao'`). 즉 A4에서 이미 구현된 Google 로그인과 완전히 동일한 코드 패턴을 그대로 복제하면 된다 — 커스텀 OIDC 코드, ID 토큰 교환 로직 전부 불필요.

카카오 개발자 앱은 아직 등록되지 않은 상태(확인됨) — 코드보다 먼저 외부 설정이 필요하다.

## 목표 동작

1. 로그인 페이지에 "카카오로 계속하기" 버튼이 Google 버튼과 나란히 보인다.
2. 클릭 시 카카오 로그인 화면으로 리다이렉트 → 동의 후 앱으로 복귀 → 세션 생성 → 기존 Google 로그인과 동일한 후속 플로우(onboarding/dashboard 분기)를 탄다.
3. 익스텐션 로그인(A19, 웹앱 탭 연동 방식)은 **코드 변경 없음** — 익스텐션은 자체 OAuth를 구현하지 않고 웹앱 탭에서 로그인 완료된 세션을 chrome.storage로 가져오는 구조이므로, 웹앱에 카카오 버튼이 추가되면 익스텐션에서도 자동으로 카카오 로그인이 가능해진다.

## 외부 설정 (코드 아님, 앱 소유자가 직접 수행)

앱이 아직 없으므로 구현 전 다음 순서로 등록이 필요하다:

1. [Kakao Developers Portal](https://developers.kakao.com)에서 앱 생성 (아이콘/이름/회사명/카테고리/도메인 입력).
2. **앱 설정 > 앱 > 플랫폼 키**에서 `REST API 키` 확인 — 이게 `client_id`.
3. Supabase Dashboard → Authentication → Providers → Kakao 아코디언에서 **콜백 URL** 확인(`https://<project-ref>.supabase.co/auth/v1/callback`).
4. 카카오 포털의 REST API 키 편집 화면 → **Kakao Login Redirect URI**에 위 콜백 URL 등록.
5. 같은 화면에서 **Kakao Login Client Secret 코드** 발급 + 활성화 — 이게 `client_secret`.
6. **제품 설정 > 카카오 로그인 > 동의항목**: `profile_nickname`, `profile_image` 설정. `account_email`은 선택(비즈앱 전환 필요) — 이메일 없이 갈 경우 다음 단계에서 "이메일 없는 사용자 허용" 옵션 켜야 함.
7. Supabase Dashboard → Providers → Kakao: Enabled ON, client_id/client_secret 입력, (이메일 미수집 시) "Allow users without an email" 켬.

이 문서는 위 외부 설정이 완료된 뒤 코드 작업을 진행한다는 전제로 작성됨 — 설정이 안 된 채로 배포하면 로그인 버튼 클릭 시 provider 에러가 난다.

## 컴포넌트

### `app/login/page.tsx`

- 기존(14~40행 근처) `signInWithGoogle` 함수를 그대로 복제한 `signInWithKakao` 추가:
  ```ts
  const signInWithKakao = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: { redirectTo: `${location.origin}/auth/callback` }, // 기존 Google과 동일 redirectTo 재사용
    })
  }
  ```
- 버튼 마크업도 기존 Google 버튼과 동일 구조로 복제, 라벨만 "카카오로 계속하기", 브랜드 컬러(#FEE500 배경 등 카카오 가이드라인)만 다르게.
- 이메일 미수집(`account_email` 동의 안 받는 경우) 시 `auth.users.email`이 null일 수 있음 — 기존 코드가 `user.email` 참조하는 곳(프로필 팝업 등, A42)이 null-safe한지 확인 필요. 이미 Google 기준으로는 항상 email 있다고 가정했을 수 있어 회귀 포인트.

### 콜백 라우트

- `app/auth/callback/route.ts`가 이미 존재한다면(Google OAuth PKCE 콜백 처리) 그대로 재사용 — provider 무관하게 동일한 `exchangeCodeForSession` 로직이므로 카카오 전용 분기 불필요.

## 에러 처리 / 한계

- 카카오 앱이 "비즈앱"이 아니면 이메일 동의항목을 받을 수 없음 — 이 경우 `email` null인 유저가 생긴다. 프로필 표시(A42)·개인정보 열람(A15) 등에서 email이 null일 때 UI가 깨지지 않는지 확인 필요(이번 스코프에 포함, 별도 A-id 안 만듦).
- 익스텐션 코드 변경 없음 — 만약 익스텐션 로그인 화면에 "카카오로 로그인" 버튼을 별도로 노출하고 싶다면 그건 후속 스코프(현재는 "웹앱 탭에서 로그인" 유도 문구만 있고 프로바이더별 분기 없음, 그대로 둠).

## 문서 갱신 필요

- 개인정보처리방침(A12): "Google OAuth 전용" 관련 문구를 "Google, Kakao OAuth" 등으로 갱신, 국외이전 조항(카카오도 국내 사업자지만 처리방침 상 명시 여부 검토).
- `docs/specs/nextjs-supabase.md`, `CLAUDE.md`의 "Google OAuth 전용(이메일/비밀번호 로그인 없음)" 문구 — 소셜 로그인 종류가 늘어난 것이지 이메일/비번 로그인 없음 원칙은 그대로 유지됨을 명확히.

## 테스트

- `login/page.test.tsx`: 카카오 버튼 렌더 확인, 클릭 시 `signInWithOAuth`가 `provider: 'kakao'`로 호출되는지 확인(Google 버튼 기존 테스트와 동일 패턴).
- 수동 확인(외부 설정 완료 후): 카카오 계정으로 실제 로그인 플로우 E2E, 이메일 미동의 케이스로 가입한 유저의 프로필/설정 화면이 깨지지 않는지 확인.
