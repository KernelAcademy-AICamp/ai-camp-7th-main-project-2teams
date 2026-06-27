# E2E: 저장 → 검색 (save-search.md)

전제: 로그인 상태, 북마크 0건. (핵심 가치 — 재발견 루프)
태스크: A5, A7, A9, A10

## 스텝

1. browser_navigate → {base_url}
2. 헤더 "북마크 추가" 클릭 → 모달 확인 (browser_snapshot)
3. URL 입력 → "추가" → 토스트 "저장됨" 확인
4. 목록에 카드 1건 + AI 태그 노출 확인
5. 검색창에 자연어 질의 입력 → 결과 1건 이상
6. 카드 클릭 → 원본 URL 이동 확인

## 통과 기준

- 각 스텝 browser_snapshot으로 요소 존재 검증
- 콘솔 에러 0 (browser_console_messages)
- 네트워크 응답에 embedding 등 민감 필드 없음 (browser_network_requests)
