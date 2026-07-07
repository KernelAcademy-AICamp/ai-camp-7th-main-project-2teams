-- A55 후속 통합: 절대 코사인 threshold 제거 + top-K 랭킹, 상대 gap(0.05)/절대 floor(0.4)
-- 관련성 컷, trgm을 word_similarity()/<%로 교체(짧은 쿼리 과소평가 방지), tags 배열도 검색 대상 포함.
-- A58(0014_search_tags_favorite_filter.sql)의 p_tags/p_is_favorite 필터는 유지.
--
-- 실측 근거(세션 내 실제 OpenAI 임베딩 + 배포된 RPC로 검증):
-- - baseline 코사인이 무관 문서끼리도 0.3~0.48대 → 절대 threshold로 노이즈 못 거름
-- - similarity('주식', '하승훈의 주식투자TV') = 0.095 (threshold 0.3 미달, word_similarity는 0.667)
-- - 상대 gap만으론 무관 쿼리(진짜 매칭 없음)에서 노이즈끼리 뭉쳐 다 통과 → top score 자체에 절대 floor 필요
-- - title에 키워드 없고 tags에만 있는 북마크는 trgm이 title만 봐서 완전히 누락됨

DROP FUNCTION IF EXISTS match_bookmarks(vector, text, float, int, uuid, uuid, boolean, text[], boolean);
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
          COALESCE((SELECT MAX(word_similarity(query_text, tg)) FROM unnest(tags) tg), 0)
        ) DESC
      ) AS trgm_rank
    FROM bookmarks
    WHERE user_id = p_user_id
      AND (
        query_text <% title
        OR EXISTS (SELECT 1 FROM unnest(tags) tg WHERE query_text <% tg)
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
