-- A55: 검색 메타데이터 필터 (카테고리)
-- 현재 선택된 카테고리 안에서만 검색되도록 match_bookmarks에 카테고리 필터 인자 추가.
-- GET /api/bookmarks의 category/미분류 해석 방식(0004_user_categories.sql 이후 유저별 카테고리)과 동일 시맨틱.

DROP FUNCTION IF EXISTS match_bookmarks(vector, text, float, int, uuid);

CREATE OR REPLACE FUNCTION match_bookmarks(
  query_embedding vector(1536),
  query_text      text,
  match_threshold float,
  match_count     int,
  p_user_id       uuid,
  p_category_id   uuid DEFAULT NULL,
  p_uncategorized boolean DEFAULT false
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
  WITH vector_matches AS (
    SELECT
      id,
      1 - (embedding <=> query_embedding) AS vec_sim,
      row_number() OVER (ORDER BY embedding <=> query_embedding) AS vec_rank
    FROM bookmarks
    WHERE user_id = p_user_id
      AND 1 - (embedding <=> query_embedding) >= match_threshold
      AND (
        (p_uncategorized AND category_id IS NULL)
        OR (NOT p_uncategorized AND p_category_id IS NULL)
        OR (NOT p_uncategorized AND category_id = p_category_id)
      )
  ),
  trgm_matches AS (
    SELECT
      id,
      row_number() OVER (ORDER BY similarity(title, query_text) DESC) AS trgm_rank
    FROM bookmarks
    WHERE user_id = p_user_id
      AND title % query_text
      AND (
        (p_uncategorized AND category_id IS NULL)
        OR (NOT p_uncategorized AND p_category_id IS NULL)
        OR (NOT p_uncategorized AND category_id = p_category_id)
      )
  ),
  combined AS (
    SELECT
      COALESCE(v.id, t.id) AS id,
      COALESCE(1.0 / (60 + v.vec_rank), 0) + COALESCE(1.0 / (60 + t.trgm_rank), 0) AS rrf_score,
      v.vec_sim
    FROM vector_matches v
    FULL OUTER JOIN trgm_matches t ON v.id = t.id
  )
  SELECT
    b.id,
    b.title,
    b.url,
    b.tags,
    b.category_id,
    b.is_favorite,
    b.created_at,
    COALESCE(c.vec_sim, 0) AS similarity
  FROM combined c
  JOIN bookmarks b ON b.id = c.id
  ORDER BY c.rrf_score DESC
  LIMIT match_count;
$$;
