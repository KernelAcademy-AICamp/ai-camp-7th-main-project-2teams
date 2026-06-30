-- A51 롤백: bge-m3(1024d) → OpenAI text-embedding-3-small(1536d) 복귀
-- 원본 1536 임베딩은 0005에서 만든 bookmarks_backup_bge_m3 에 보존됨 → 그대로 복원.
-- 주의: 0005 적용 후 신규 저장된 북마크(백업에 없는 행)는 1024 bge-m3 임베딩 → 복원 불가,
--       NULL 처리되어 OpenAI(text-embedding-3-small) 재임베딩 필요(별도). 검색 누락만 발생(에러 아님).

-- 1. 인덱스 제거 (차원 변경 전 필수)
DROP INDEX IF EXISTS bookmarks_embedding_idx;

-- 2. 차원 1024 → 1536 (현 1024 값 폐기)
ALTER TABLE bookmarks ALTER COLUMN embedding TYPE vector(1536) USING NULL;

-- 3. 백업에서 원본 1536 임베딩 복원 (0005 시점 1277건)
UPDATE bookmarks b
  SET embedding = k.embedding
  FROM bookmarks_backup_bge_m3 k
  WHERE k.id = b.id;

-- 4. HNSW 인덱스 재생성 (0001 동일 파라미터)
CREATE INDEX bookmarks_embedding_idx
  ON bookmarks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 5. match_bookmarks 차원 1024 → 1536 복귀 (0002 동일 본문)
CREATE OR REPLACE FUNCTION match_bookmarks(
  query_embedding vector(1536),
  match_threshold float,
  match_count     int,
  p_user_id       uuid
)
RETURNS TABLE (
  id          uuid,
  title       text,
  url         text,
  tags        text[],
  category_id uuid,
  is_favorite boolean,
  created_at  timestamptz,
  similarity  float
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    id,
    title,
    url,
    tags,
    category_id,
    is_favorite,
    created_at,
    1 - (embedding <=> query_embedding) AS similarity
  FROM bookmarks
  WHERE
    user_id = p_user_id
    AND 1 - (embedding <=> query_embedding) >= match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 6. 복원 검증 후 백업 정리 (수동 확인 후 실행 권장):
--    SELECT count(*) FILTER (WHERE embedding IS NULL) FROM bookmarks;  -- 0006 후 신규 1건만 NULL 기대
--    DROP TABLE bookmarks_backup_bge_m3;
