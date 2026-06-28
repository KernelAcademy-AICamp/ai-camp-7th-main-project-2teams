-- A7: 자연어 벡터 검색 RPC
-- 출처: docs/specs/database.md. cosine 유사도(1 - <=>) 기준 본인 북마크 검색.
-- embedding 컬럼은 반환하지 않음 (응답 누출 방지).

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
