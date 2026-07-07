-- categories 테이블 UPDATE RLS 정책 누락 수정
-- PATCH /api/bookmarks/:id의 resolveCategoryId가 upsert(onConflict: user_id,name)를 쓰는데
-- UPDATE 정책이 없어 이미 존재하는 카테고리로 재배정 시 RLS에 막혀 500 발생.
-- (미분류 -> 이미 보유한 카테고리로 변경할 때 재현)

CREATE POLICY "categories_update"
  ON categories FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
