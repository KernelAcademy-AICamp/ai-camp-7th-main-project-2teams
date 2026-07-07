-- 북마크 카드에 표시할 사용자 입력 설명 컬럼 추가 (검색 편의용, 추후 북마크 수정 기능에서 편집)
-- 기존 "본문(content) DB 저장 금지" 정책과 별개: 이 컬럼은 AI가 스크랩한 웹페이지 본문이 아니라
-- 사용자가 직접 입력하는 짧은 메모/설명이므로 프라이버시 정책 위반 아님.
ALTER TABLE bookmarks
  ADD COLUMN description TEXT;
