# E2E: 파일 임포트 (import.md)

전제: 로그인 상태. 크롬 북마크 HTML 샘플 준비 (front/**fixtures**/bookmarks.html).
태스크: A29, A30, A31

## 스텝 (HTML 소스)

1. browser_navigate → {base_url}
2. 헤더 "파일 업로드" 클릭 → 임포트 UI 확인 (browser_snapshot)
3. 소스 선택 라디오에서 "브라우저 북마크 업로드" 선택 확인 (기본값)
4. browser_file_upload → bookmarks.html 선택
5. 파일명·크기·미리보기 개수("N개 북마크 발견") 표시 + "업로드" 버튼 노출 확인
6. "업로드" → 진행 상황 UI 노출 → 완료 상태 확인
7. 목록에 임포트 북마크 노출 확인
8. 사이드바 "내 폴더" 섹션 노출 + folder_hint 기반 폴더명 확인 (A31)

## 스텝 (카카오톡 CSV 소스)

1. 임포트 UI에서 소스 선택 라디오 "카카오톡 대화내용 업로드" 클릭
2. 드롭 영역 accept가 `.csv`로 전환됨 확인 (browser_snapshot)
3. browser_file_upload → 카카오톡 채팅 내보내기 CSV(Date,User,Message 컬럼) 선택
4. 파일명·크기·미리보기 개수("N개 URL 발견") 표시 확인 — Message 컬럼 내 URL만 카운트
5. "업로드" → 완료 상태 확인 → 목록에 URL 기반 북마크 노출 확인 (title=url)
6. 응답·네트워크 요청에 대화 원문(content) 미노출 확인

## 통과 기준

- 각 스텝 browser_snapshot으로 요소 존재
- 콘솔 에러 0 (browser_console_messages)
- 응답에 embedding/content 미노출 (browser_network_requests)
- 임포트 0건 시 "내 폴더" 섹션 미노출
- HTML/CSV 확장자 불일치 파일 업로드 시 소스별 에러 메시지 노출 (HTML: "HTML(.html) 파일만...", CSV: "CSV(.csv) 파일만...")
