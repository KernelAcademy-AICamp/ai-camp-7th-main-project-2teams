-- 북마크 URL 정규화 백필 전 백업 — dedup으로 행 삭제가 발생하므로 비가역 대비 필수.
-- 적용 순서: 이 마이그레이션 적용 → front/scripts/backfill-normalize-url.ts 실행.
-- 복원: TRUNCATE bookmarks; INSERT INTO bookmarks SELECT * FROM bookmarks_backup_url_norm;
-- embedding 포함 전체 행 보존 — 백업은 DB 내부에만 존재(응답·로그로 유출 없음, 보안 규칙 준수).

DROP TABLE IF EXISTS bookmarks_backup_url_norm;
CREATE TABLE bookmarks_backup_url_norm AS SELECT * FROM bookmarks;
