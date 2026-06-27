# 보안 규칙 (단일 출처)

CLAUDE.md 보안 제약의 코드 레벨 체크리스트. `security-auditor` 에이전트 · secret-scan hook · CI가 공통 참조한다.

## 보안 3종 + Route 패턴

### 1. 키 노출 금지
- `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`에 `NEXT_PUBLIC_` 접두어 금지 — 서버사이드 전용
- 위 키를 클라이언트 컴포넌트(`'use client'`)·브라우저 번들·extension 코드에서 참조 금지
- `.env*`는 `.gitignore` 대상, 커밋 금지

### 2. embedding 응답 금지
- API 응답 객체에 `embedding` 컬럼 절대 미포함 (`GET /api/bookmarks`, `match_bookmarks` RPC 결과 등)
- Supabase 쿼리는 `select('*')` 대신 **명시적 컬럼 지정** — embedding 누출 방지

### 3. content(본문) 저장·로그 금지
- `content`는 DB 컬럼/insert 금지 — OpenAI 처리 후 즉시 파기
- `content` 평문 로그 출력 금지 — 마스킹 유틸(A8) 경유 필수

### 4. Route Handler 안전 패턴
- `withAuth` HOF 필수
- 입력 Zod `safeParse` 검증 필수
- 대상 테이블 RLS 정책 존재
- XSS / SQL Injection 유입 경로 차단 (파라미터 바인딩, 출력 이스케이프)

### 5. 인증
- Google OAuth 전용 (Supabase Auth). 이메일/비밀번호 로그인 없음

## 위반 시
- secret-scan hook: Edit/Write 단계에서 `NEXT_PUBLIC_`+키 / content 로깅 패턴 적중 시 차단(exit 2)
- security-auditor: BLOCK 판정 → 커밋/푸시/PR 중단
- CI: 동일 기준 리뷰 코멘트 + 게이트
