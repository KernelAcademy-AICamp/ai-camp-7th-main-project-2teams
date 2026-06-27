-- A1: 북마크 DB 스키마 + pgvector
-- 출처: docs/specs/database.md (단일 출처). RPC match_bookmarks(A7), 탈퇴 CASCADE(A14)는 각 태스크 소관.

-- 1. pgvector 확장
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 고정 대분류 (AI 태깅 tags[0] → categories.name 매핑)
CREATE TABLE categories (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE
);

INSERT INTO categories (name) VALUES
  ('개발'), ('AI/ML'), ('디자인'), ('비즈니스'), ('학습'), ('쇼핑');

-- categories는 고정 참조 데이터 — 로그인 유저 읽기만 허용 (쓰기 정책 없음 = 차단)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_select"
  ON categories FOR SELECT
  TO authenticated
  USING (true);

-- 3. bookmarks (content 컬럼 없음 — 본문은 OpenAI 처리 후 즉시 파기)
CREATE TABLE bookmarks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  url         TEXT        NOT NULL,
  tags        TEXT[]      NOT NULL DEFAULT '{}',
  category_id UUID        REFERENCES categories(id),  -- tags[0] 매핑, null = 미분류
  folder_hint TEXT[],                                 -- 크롬 폴더 경로 (파일 임포트 시 원본 보존)
  is_favorite BOOLEAN     NOT NULL DEFAULT false,     -- 즐겨찾기 토글 (A27)
  embedding   vector(1536),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. HNSW 인덱스 (cosine, pgvector 0.5+)
CREATE INDEX bookmarks_embedding_idx
  ON bookmarks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 5. RLS — 본인 데이터만 (4종 정책)
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bookmarks_select"
  ON bookmarks FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "bookmarks_insert"
  ON bookmarks FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "bookmarks_update"
  ON bookmarks FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "bookmarks_delete"
  ON bookmarks FOR DELETE
  USING (user_id = auth.uid());
