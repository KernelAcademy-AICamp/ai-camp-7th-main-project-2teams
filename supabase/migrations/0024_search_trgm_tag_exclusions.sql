-- "Codex"↔"Claude Code"(word_similarity=0.667) 같은 트라이그램 우연한 겹침 오탐 수정.
-- 0023에서 확인됨: 단일 threshold로는 이런 오탐과 "3D"↔"3D모델링"·"에르메스"↔"헤르메스
-- 에이전트" 같은 의도된 상위/하위·표기변형 태그 관계를 구분 못 함(같은 점수대 0.6~0.8).
-- → threshold 조정 대신 알려진 오탐 쌍만 명시적으로 예외처리하는 테이블 도입.
-- 범위: 태그 채널만. title/description에 "Claude Code" 문자열이 그대로 들어간 경우는
-- 자유텍스트라 정확일치 예외처리 불가 — 커버 안 됨, 별도 문제로 남김.

CREATE TABLE IF NOT EXISTS search_trgm_tag_exclusions (
  term_a text NOT NULL,
  term_b text NOT NULL,
  PRIMARY KEY (term_a, term_b)
);

ALTER TABLE search_trgm_tag_exclusions ENABLE ROW LEVEL SECURITY;
-- 전역 설정 테이블 — 전 유저 공유, anon/authenticated 조회만 허용(쓰기는 service_role/마이그레이션 전용).
CREATE POLICY "search_trgm_tag_exclusions_select"
  ON search_trgm_tag_exclusions FOR SELECT
  USING (true);

INSERT INTO search_trgm_tag_exclusions (term_a, term_b) VALUES
  ('codex', 'claude code')
ON CONFLICT DO NOTHING;

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
    COALESCE(c.vec_sim, 0) AS similarity
  FROM combined c
  JOIN bookmarks b ON b.id = c.id
  WHERE c.matched_trgm OR (c.vec_sim >= 0.5 AND c.vec_sim >= c.top_vec_sim - 0.03)
  ORDER BY c.rrf_score DESC
  LIMIT match_count;
$$;
