# E2E: 관리자 대시보드 (admin.md)

전제: `/admin` 대시보드 v2 (OKR·성장·동향·관리자관리). 대상 = preview URL 또는 로컬 dev 서버.

게이팅: `admin_users` 테이블 + `is_admin()` RPC 기반(`withAdmin`). 구 `ADMIN_USER_IDS` env allowlist는 폐기됨.

준비:
- **관리자 계정**: 테스트 계정 user.id를 `admin_users`에 시드 — `INSERT INTO admin_users (user_id, granted_by) VALUES ('<user.id>', '<user.id>');`
- **비관리자 계정**: `admin_users`에 없는 일반 계정
- `OPENAI_ADMIN_KEY` — OpenAI 사용량 위젯 조회용 (미설정 시 저니 D로 확인)

## 스텝

### A. 비관리자 차단

1. 비관리자 계정으로 로그인
2. browser_navigate → `{base_url}/admin`
3. 404 페이지 확인 (browser_snapshot) — 관리자 여부를 노출하지 않고 은닉

### B. 관리자 기본 뷰

4. 관리자 계정(`admin_users` 시드됨)으로 로그인
5. browser_navigate → `{base_url}/admin`
6. OKR 타일 4개 노출 확인 — 활성 사용자·첫 저장률·1인당 저장·신규 저장 (browser_snapshot)
7. OpenAI 사용량 위젯 노출 확인
8. 카테고리 랭킹막대(CategoryBar/BarList) 노출 확인
9. 성장 추이 영역그래프(GrowthChart) 노출 확인
10. 트렌딩 태그(TrendingTags)·건강 지표(HealthStats: 데드링크·미분류 비율) 노출 확인
11. `GET /api/admin/stats?range=7d`, `GET /api/admin/openai-usage?range=7d` 요청 확인, 응답에 embedding·content 등 민감 필드 없음 (browser_network_requests)
12. range 탭 `30d` 클릭 → URL이 `?range=30d`로 변경 확인, 두 API가 `range=30d`로 재요청되고 데이터 갱신 확인

### C. 카테고리 드릴다운 (URL 동기화 모달)

13. 카테고리 랭킹막대에서 항목 버튼 클릭
14. URL이 `?range=…&category=<name>`으로 변경 확인
15. `CategoryDrilldownModal`에 하위 태그 랭킹막대 표시 확인 (browser_snapshot)
16. 페이지 새로고침(browser_navigate 재진입) → 모달이 동일 상태로 복원되는지 확인 (딥링크 검증)
17. 닫기(✕ 또는 배경 클릭) → URL에서 `category` 파라미터 제거, 모달 닫힘 확인

### D. 사용량 조회 불가 처리

18. `OPENAI_ADMIN_KEY` 미설정 환경에서 관리자 계정으로 `/admin` 접속
19. OpenAI 위젯에 "사용량 조회 불가" 등 명시적 안내 노출 확인 — 무음 실패(빈 화면·무한 로딩) 없음

### E. stats API 실패 시 에러 처리

20. `/api/admin/stats`가 500을 반환하는 환경(예: RPC 오류 재현)에서 관리자 계정으로 `/admin` 접속
21. "대시보드 데이터를 불러오지 못했습니다" 에러 메시지 노출 확인 — OKR 타일·차트가 깨진 값으로 렌더되거나 페이지가 크래시하지 않음
22. OpenAI 사용량 위젯은 별도 API이므로 stats 실패와 무관하게 정상 동작(또는 저니 D대로 조회 불가) 확인

### F. 관리자 관리 (AdminManager 승격/강등)

23. 관리자 계정으로 `/admin` 접속 → AdminManager 관리자 목록 노출 확인 (browser_snapshot)
24. 이메일 입력 후 승격 → `POST /api/admin/admins`로 요청, 목록에 신규 관리자 추가 확인
25. 존재하지 않는 이메일로 승격 시도 → 422 + "해당 이메일의 사용자를 찾을 수 없습니다" 안내 확인
26. 타 관리자 강등 → `DELETE /api/admin/admins?userId=…`로 요청, 목록에서 제거 확인
27. 본인 강등 시도 → 400 + "본인은 강등할 수 없습니다" 안내 확인 (잠금아웃 방지)

## 통과 기준

- 각 스텝 browser_snapshot으로 요소 존재/부재 검증
- 콘솔 에러 0 (browser_console_messages)
- `GET /api/admin/stats`, `GET /api/admin/openai-usage` 응답에 embedding·content 등 민감 필드 없음
- 비관리자 접근 시 403이 아닌 404로 은닉 (관리자 존재 여부 비노출)
- range·category 상태가 URL 쿼리와 항상 동기화 (새로고침 후에도 복원)
- 관리자 관리 뮤테이션은 `withAdmin` 게이팅 + 본인 강등 방지 준수
