# E2E: 로그인 (auth.md)

전제: 비로그인 상태. 대상 = preview URL 또는 로컬 dev 서버.
태스크: A4, A26, A63

## 스텝

1. browser_navigate → {base_url}
2. 비로그인 → `/login`(또는 온보딩) 리다이렉트 확인 (browser_snapshot)
3. "Google로 계속하기", "카카오로 계속하기" 버튼 존재 확인
4. (모킹/테스트 계정) 로그인 → `/` 진입 확인
5. 헤더에 사용자 메뉴 노출 확인

## 통과 기준

- 각 스텝 browser_snapshot으로 요소 존재
- 콘솔 에러 0 (browser_console_messages)
- 이메일/비밀번호 입력 필드 없음 (Google/Kakao OAuth 전용)
- 카카오 로그인은 email이 null일 수 있음 — 프로필/설정 화면에서 "이메일 미제공" 폴백 노출 확인
