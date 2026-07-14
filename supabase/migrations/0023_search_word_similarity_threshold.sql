-- `<%` 연산자(GUC pg_trgm.word_similarity_threshold 의존)를 명시적 word_similarity() 비교로 교체.
-- 이유: 원격 Supabase managed role은 함수 레벨 `SET pg_trgm.word_similarity_threshold`
--   권한이 없음(permission denied) — 로컬은 superuser라 안 걸렸으나 원격 배포 불가능했음.
-- title/description/tags 전부 0.6 — 원래 `<%` 연산자 기본 GUC 값과 수학적으로 동일
--   (word_similarity >= 0.6), 회귀 없음. 0.65/0.7/tags 0.85 전부 시도했으나 철회 —
--   "Codex"↔"Claude Code"(0.667) 오탐 하나 막으려다 "3D"↔"3D모델링"·"영상"↔"영상편집"·
--   "에르메스"↔"헤르메스 에이전트"·"옵시디안"↔"옵시디언" 등 의도된 상위/하위·표기변형 태그
--   관계가 같은 점수대(0.6~0.8)라 함께 깨짐. 단일 threshold로는 "우연한 문자열 겹침"과
--   "의도된 관련어"를 구분 못 함 — Codex/Claude Code 오탐은 알려진 한계로 남겨둠, 별도
--   처리(태그 쌍 예외처리 등) 필요.

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
        word_similarity(query_text, title) >= 0.6
        OR EXISTS (SELECT 1 FROM unnest(tags) tg WHERE word_similarity(query_text, tg) >= 0.6)
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
