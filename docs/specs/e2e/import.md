# E2E: 파일 임포트 (import.md)

전제: 로그인 상태. 크롬 북마크 HTML 샘플 준비 (front/__fixtures__/bookmarks.html).
태스크: A29, A30, A31

## 스텝

1. browser_navigate → {base_url}
2. 헤더 "파일 업로드" 클릭 → 임포트 UI 확인 (browser_snapshot)
3. browser_file_upload → bookmarks.html 선택
4. 파일명·크기 표시 + "업로드" 버튼 노출 확인 (선택 파일 정보)
5. "업로드" → 진행 상황 UI 노출 → 완료 상태 확인
6. 목록에 임포트 북마크 노출 확인
7. 사이드바 "내 폴더" 섹션 노출 + folder_hint 기반 폴더명 확인 (A31)

## 통과 기준

- 각 스텝 browser_snapshot으로 요소 존재
- 콘솔 에러 0 (browser_console_messages)
- 응답에 embedding/content 미노출 (browser_network_requests)
- 임포트 0건 시 "내 폴더" 섹션 미노출
