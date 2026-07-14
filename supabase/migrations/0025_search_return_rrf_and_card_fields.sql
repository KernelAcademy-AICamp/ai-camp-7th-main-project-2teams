-- 검색 정합성 수정 (2026-07 자가 점검 후속):
-- 1) rrf_score 반환 — 기존엔 similarity(=vec_sim)만 반환해 API 레이어(alias 병합 재정렬)가
--    벡터 유사도로 정렬할 수밖에 없었고, trgm 전용 매치(vec_sim=0인 정확 단어 일치)가
--    최하위로 강등돼 하이브리드 검색(A54)의 취지가 무효화됐다. RRF 점수를 그대로 노출해
--    라우트가 DB 랭킹을 유지한 채 병합·정렬하도록 한다.
-- 2) category(이름)·folder_hint·is_dead 반환 — 목록 API(GET /api/bookmarks)와 달리 검색
--    결과에서만 카테고리 칩·링크끊김 배지가 소실되던 비대칭 해소. SearchResult가
--    Bookmark 타입을 extends하는 프론트 계약을 실제로 충족시킨다.
-- 검색 로직(CTE·threshold·필터)은 0024와 동일 — 반환 컬럼만 추가.

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
  similarity    float,
  category      text,
  folder_hint   text[],
  is_dead       boolean,
  rrf_score     float
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
          COALESCE((
            SELECT MAX(word_similarity(query_text, tg))
            FROM unnest(tags) tg
            WHERE NOT EXISTS (
              SELECT 1 FROM search_trgm_tag_exclusions e
              WHERE (lower(e.term_a) = lower(query_text) AND lower(e.term_b) = lower(tg))
                 OR (lower(e.term_b) = lower(query_text) AND lower(e.term_a) = lower(tg))
            )
          ), 0),
          word_similarity(query_text, COALESCE(description, ''))
        ) DESC
      ) AS trgm_rank
    FROM bookmarks
    WHERE user_id = p_user_id
      AND (
        word_similarity(query_text, title) >= 0.6
        OR EXISTS (
          SELECT 1 FROM unnest(tags) tg
          WHERE word_similarity(query_text, tg) >= 0.6
            AND NOT EXISTS (
              SELECT 1 FROM search_trgm_tag_exclusions e
              WHERE (lower(e.term_a) = lower(query_text) AND lower(e.term_b) = lower(tg))
                 OR (lower(e.term_b) = lower(query_text) AND lower(e.term_a) = lower(tg))
            )
        )
        OR (description IS NOT NULL AND word_similarity(query_text, description) >= 0.6)
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
    COALESCE(c.vec_sim, 0) AS similarity,
    cat.name AS category,
    b.folder_hint,
    b.is_dead,
    c.rrf_score::float AS rrf_score
  FROM combined c
  JOIN bookmarks b ON b.id = c.id
  LEFT JOIN categories cat ON cat.id = b.category_id
  WHERE c.matched_trgm OR (c.vec_sim >= 0.5 AND c.vec_sim >= c.top_vec_sim - 0.03)
  ORDER BY c.rrf_score DESC
  LIMIT match_count;
$$;
