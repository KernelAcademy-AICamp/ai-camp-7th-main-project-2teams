-- 북마크 URL 404/410(죽은 링크) 감지 플래그. preview·저장·백필 스크립트가 공통 사용.
ALTER TABLE bookmarks ADD COLUMN is_dead BOOLEAN NOT NULL DEFAULT false;
