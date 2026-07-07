-- match_bookmarks가 description/thumbnail_url을 반환하지 않아 검색 결과 카드에서
-- 설명·썸네일이 안 보이던 버그 수정. GET /api/bookmarks는 이미 두 컬럼 select 중 —
-- 검색 응답만 스펙에서 누락돼 있었음.

DROP FUNCTION IF EXISTS match_bookmarks(vector, text, int, uuid, uuid, boolean, text[], boolean);

CREATE OR REPLACE FUNCTION match_bookmarks(
  query_embedding vector(1536),
  query_text      text,
  match_count     int,
  p_user_id       uuid,
  p_category_id   uuid DEFAULT NULL,
  p_uncategorized boolean DEFAULT false,
  p_tags          text[] DEFAULT NULL,
  p_is_favorite   boolean DEFAULT NULL
)
RETURNS TABLE (
  id            uuid,
  title         text,
  url           text,
  description   text,
  thumbnail_url text,
  tags          text[],
  category_id   uuid,
  is_favorite   boolean,
  created_at    timestamptz,
  similarity    float
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
      AND (
        (p_uncategorized AND category_id IS NULL)
        OR (NOT p_uncategorized AND p_category_id IS NULL)
        OR (NOT p_uncategorized AND category_id = p_category_id)
      )
      AND (p_tags IS NULL OR tags && p_tags)
      AND (p_is_favorite IS NULL OR is_favorite = p_is_favorite)
    ORDER BY embedding <=> query_embedding
    LIMIT GREATEST(match_count * 5, 50)
  ),
  trgm_matches AS (
    SELECT
      id,
      row_number() OVER (
        ORDER BY GREATEST(
          word_similarity(query_text, title),
          COALESCE((SELECT MAX(word_similarity(query_text, tg)) FROM unnest(tags) tg), 0),
          word_similarity(query_text, COALESCE(description, ''))
        ) DESC
      ) AS trgm_rank
    FROM bookmarks
    WHERE user_id = p_user_id
      AND (
        query_text <% title
        OR EXISTS (SELECT 1 FROM unnest(tags) tg WHERE query_text <% tg)
        OR (description IS NOT NULL AND query_text <% description)
      )
      AND (
        (p_uncategorized AND category_id IS NULL)
        OR (NOT p_uncategorized AND p_category_id IS NULL)
        OR (NOT p_uncategorized AND category_id = p_category_id)
      )
      AND (p_tags IS NULL OR tags && p_tags)
      AND (p_is_favorite IS NULL OR is_favorite = p_is_favorite)
  ),
  combined AS (
    SELECT
      COALESCE(v.id, t.id) AS id,
      COALESCE(1.0 / (60 + v.vec_rank), 0) + COALESCE(1.0 / (60 + t.trgm_rank), 0) AS rrf_score,
      v.vec_sim,
      t.id IS NOT NULL AS matched_trgm,
      MAX(v.vec_sim) OVER () AS top_vec_sim
    FROM vector_matches v
    FULL OUTER JOIN trgm_matches t ON v.id = t.id
  )
  SELECT
    b.id,
    b.title,
    b.url,
    b.description,
    b.thumbnail_url,
    b.tags,
    b.category_id,
    b.is_favorite,
    b.created_at,
    COALESCE(c.vec_sim, 0) AS similarity
  FROM combined c
  JOIN bookmarks b ON b.id = c.id
  WHERE c.matched_trgm OR (c.vec_sim >= 0.4 AND c.vec_sim >= c.top_vec_sim - 0.05)
  ORDER BY c.rrf_score DESC
  LIMIT match_count;
$$;
