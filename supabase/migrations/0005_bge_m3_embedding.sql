-- A51: 임베딩 모델 OpenAI text-embedding-3-small(1536d) → bge-m3(1024d) 전환
-- 출처: docs/specs/database.md. 벤치마크(recall@1 75%→92.5%, 저장 414KB→276KB) 근거 교체.
-- 주의: 비가역(차원 변경). 적용 전 백업 테이블 생성. 적용 후 scripts/reembed-bge.mjs로 재임베딩 필수.

-- 1. 백업 — embedding은 차원 불일치로 폐기되므로 title/url/tags 등 행 데이터 보존이 목적
CREATE TABLE bookmarks_backup_bge_m3 AS SELECT * FROM bookmarks;

-- 2. HNSW 인덱스 제거 (차원 변경 전 필수)
DROP INDEX IF EXISTS bookmarks_embedding_idx;

-- 3. 차원 변경 — 1536 벡터는 1024로 캐스팅 불가 → NULL로 비우고 재임베딩 대상화
--    (NULL embedding 행은 match_bookmarks의 <=> 비교에서 제외 → 재임베딩 전까지 검색 빈 결과, 에러 아님)
ALTER TABLE bookmarks ALTER COLUMN embedding TYPE vector(1024) USING NULL;

-- 4. HNSW 인덱스 재생성 (0001과 동일 파라미터)
CREATE INDEX bookmarks_embedding_idx
  ON bookmarks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 5. match_bookmarks 재정의 — 0002와 동일 본문, query_embedding 차원만 1536 → 1024
CREATE OR REPLACE FUNCTION match_bookmarks(
  query_embedding vector(1024),
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
SET search_path = public  -- search_path 고정 (하이재킹 방지, vector 연산자/bookmarks 해석)
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
