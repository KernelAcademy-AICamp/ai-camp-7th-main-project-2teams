-- A35: (user_id, url) unique 제약 — 동일 사용자의 URL 중복 저장 방지

BEGIN;

-- 기존 중복 행 정리: 각 (user_id, url) 그룹에서 가장 최근(created_at DESC) 1건만 유지
DELETE FROM bookmarks
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, url) id
  FROM bookmarks
  ORDER BY user_id, url, created_at DESC
);

-- 멱등성: 제약이 이미 존재하면 건너뜀
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookmarks_user_url_unique'
  ) THEN
    ALTER TABLE bookmarks
      ADD CONSTRAINT bookmarks_user_url_unique UNIQUE (user_id, url);
  END IF;
END $$;

COMMIT;
