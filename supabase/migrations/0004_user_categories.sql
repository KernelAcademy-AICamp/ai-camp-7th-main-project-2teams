-- 시나리오 B: categories를 전역 고정값에서 유저별 개인 카테고리로 전환
-- 신규 유저 → 카테고리 0개, 북마크 저장/임포트 시 AI가 자동 생성

BEGIN;

-- 기존 전역 category_id 참조 해제 (전역 카테고리 삭제 전 FK 정리)
UPDATE bookmarks SET category_id = NULL WHERE category_id IS NOT NULL;

-- 전역 시드 데이터 삭제
DELETE FROM categories;

-- user_id 컬럼 추가
ALTER TABLE categories ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE categories ALTER COLUMN user_id SET NOT NULL;

-- UNIQUE(name) → UNIQUE(user_id, name)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'categories_name_key'
  ) THEN
    ALTER TABLE categories DROP CONSTRAINT categories_name_key;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'categories_user_id_name_key'
  ) THEN
    ALTER TABLE categories ADD CONSTRAINT categories_user_id_name_key UNIQUE (user_id, name);
  END IF;
END $$;

-- RLS 정책 재설정
DROP POLICY IF EXISTS "categories_select" ON categories;

CREATE POLICY "categories_select"
  ON categories FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "categories_insert"
  ON categories FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "categories_delete"
  ON categories FOR DELETE
  USING (user_id = auth.uid());

COMMIT;
