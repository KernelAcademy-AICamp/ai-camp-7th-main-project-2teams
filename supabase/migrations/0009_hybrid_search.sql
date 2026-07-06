-- A54: 하이브리드 검색 (pgvector + pg_trgm, RRF 병합)
-- 순수 벡터 코사인 유사도만으로는 정확 단어 매칭에 취약 (의미상 가까운 다른 글이 끼어들거나
-- 정확히 그 단어가 제목에 있는 글이 밀림). pg_trgm 트라이그램 유사도를 키워드 매칭으로 병행,
-- Reciprocal Rank Fusion(RRF)으로 두 랭킹을 병합. 한글은 형태소 분석 없는 tsvector('simple' config)
-- 보다 트라이그램 부분 문자열 매칭이 더 잘 맞음.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS bookmarks_title_trgm_idx
  ON bookmarks
  USING gin (title gin_trgm_ops);

-- 기존 match_bookmarks(vector, float, int, uuid) 대체.
-- 호출부는 front/app/api/search/route.ts 단일 지점 — 시그니처 변경 안전.
DROP FUNCTION IF EXISTS match_bookmarks(vector, float, int, uuid);

CREATE OR REPLACE FUNCTION match_bookmarks(
  query_embedding vector(1536),
  query_text      text,
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
SET search_path = public  -- search_path 고정 (하이재킹 방지, vector/trgm 연산자·bookmarks 해석)
AS $$
  WITH vector_matches AS (
    SELECT
      id,
      1 - (embedding <=> query_embedding) AS vec_sim,
      row_number() OVER (ORDER BY embedding <=> query_embedding) AS vec_rank
    FROM bookmarks
    WHERE user_id = p_user_id
      AND 1 - (embedding <=> query_embedding) >= match_threshold
  ),
  trgm_matches AS (
    SELECT
      id,
      row_number() OVER (ORDER BY similarity(title, query_text) DESC) AS trgm_rank
    FROM bookmarks
    WHERE user_id = p_user_id
      AND title % query_text  -- pg_trgm.similarity_threshold(기본 0.3) 이상만 후보
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
