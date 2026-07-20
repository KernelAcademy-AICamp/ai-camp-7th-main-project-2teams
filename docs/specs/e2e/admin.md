# E2E: 관리자 대시보드 (admin.md)

전제: `/admin` 대시보드 기능 (Task 1-11). 대상 = preview URL 또는 로컬 dev 서버.

환경변수:
- `ADMIN_USER_IDS` — 테스트 관리자 계정 user.id를 쉼표 구분으로 포함
- `OPENAI_ADMIN_KEY` — OpenAI 사용량 위젯 조회용 (미설정 시 저니 4로 확인)

## 스텝

### A. 비관리자 차단

1. 비관리자 계정으로 로그인
2. browser_navigate → `{base_url}/admin`
3. 404 페이지 확인 (browser_snapshot) — 관리자 여부를 노출하지 않고 은닉

### B. 관리자 기본 뷰

4. 관리자 계정(`ADMIN_USER_IDS` 포함)으로 로그인
5. browser_navigate → `{base_url}/admin`
6. OKR 타일 4개 노출 확인 (browser_snapshot)
7. OpenAI 사용량 위젯 노출 확인
8. 카테고리 도넛(CategoryPie) 노출 확인
9. `GET /api/admin/stats?range=7d`, `GET /api/admin/openai-usage?range=7d` 요청 확인, 응답에 embedding·content 등 민감 필드 없음 (browser_network_requests)
10. range 탭 `30d` 클릭 → URL이 `?range=30d`로 변경 확인, 두 API가 `range=30d`로 재요청되고 데이터 갱신 확인

### C. 카테고리 드릴다운 (URL 동기화 모달)

11. 카테고리 도넛에서 슬라이스(또는 범례 버튼) 클릭
12. URL이 `?range=…&category=<name>`으로 변경 확인
13. `CategoryDrilldownModal`에 하위 태그 도넛 표시 확인 (browser_snapshot)
14. 페이지 새로고침(browser_navigate 재진입) → 모달이 동일 상태로 복원되는지 확인 (딥링크 검증)
15. 닫기(✕ 또는 배경 클릭) → URL에서 `category` 파라미터 제거, 모달 닫힘 확인

### D. 사용량 조회 불가 처리

16. `OPENAI_ADMIN_KEY` 미설정 환경에서 관리자 계정으로 `/admin` 접속
17. OpenAI 위젯에 "사용량 조회 불가" 등 명시적 안내 노출 확인 — 무음 실패(빈 화면·무한 로딩) 없음

## 통과 기준

- 각 스텝 browser_snapshot으로 요소 존재/부재 검증
- 콘솔 에러 0 (browser_console_messages)
- `GET /api/admin/stats`, `GET /api/admin/openai-usage` 응답에 embedding·content 등 민감 필드 없음
- 비관리자 접근 시 403이 아닌 404로 은닉 (관리자 존재 여부 비노출)
- range·category 상태가 URL 쿼리와 항상 동기화 (새로고침 후에도 복원)
