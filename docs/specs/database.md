# DB 스펙 — pgvector + Supabase

**관련 태스크**: A1, A7, A27, A29, A31

---

## 확장 설치

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## 테이블 DDL

```sql
-- 유저별 개인 카테고리 (시드 없음, 북마크 저장/임포트 시 AI 태그에서 추출한 대분류(extractTopCategory) 기반 자동 생성)
-- 마이그레이션 0004_user_categories.sql 에서 전역 고정값 → 유저별로 전환
CREATE TABLE categories (
  id      UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name    TEXT  NOT NULL,
  UNIQUE (user_id, name)
);

CREATE TABLE bookmarks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  url         TEXT        NOT NULL,
  tags        TEXT[]      NOT NULL DEFAULT '{}',
  category_id UUID        REFERENCES categories(id),   -- AI 태그에서 추출한 대분류 매핑, null = 미분류
  folder_hint TEXT[],                                   -- 크롬 폴더 경로 (파일 임포트 시 원본 경로 보존)
  is_favorite BOOLEAN     NOT NULL DEFAULT false,       -- 즐겨찾기 토글 (A27)
  is_dead     BOOLEAN     NOT NULL DEFAULT false,       -- 저장 시점 404/410 감지 (마이그레이션 0021)
  description TEXT,                                     -- 사용자 입력 설명 (A60, 마이그레이션 0013). content(본문) 아님 — 프라이버시 정책과 무관
  thumbnail_url TEXT,                                    -- og:image/YouTube 썸네일 URL만 저장 (마이그레이션 0017), 이미지 자체는 미저장
  embedding   vector(1536),                              -- text-embedding-3-small (A51 bge-m3 롤백, 마이그레이션 0006)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bookmarks_user_url_unique UNIQUE (user_id, url) -- A35: 동일 사용자 URL 중복 저장 방지 (마이그레이션 0003)
);
```

> `content` 컬럼 없음. 본문은 OpenAI 처리 후 즉시 파기.

---

## HNSW 인덱스 (pgvector 0.5+)

```sql
CREATE INDEX bookmarks_embedding_idx
  ON bookmarks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

| 파라미터 | 값 | 설명 |
|---|---|---|
| `m` | 16 | 노드당 최대 연결 수 (높을수록 정확도↑, 메모리↑) |
| `ef_construction` | 64 | 인덱스 빌드 탐색 범위 |

검색 시 정확도 조정:
```sql
SET hnsw.ef_search = 100; -- 기본값 40, 높을수록 정확도↑ 속도↓
```

---

## RLS (Row Level Security)

```sql
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

-- 조회: 본인 데이터만
CREATE POLICY "bookmarks_select"
  ON bookmarks FOR SELECT
  USING (user_id = auth.uid());

-- 삽입: 본인 user_id로만
CREATE POLICY "bookmarks_insert"
  ON bookmarks FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- 수정: 본인 데이터만
CREATE POLICY "bookmarks_update"
  ON bookmarks FOR UPDATE
  USING (user_id = auth.uid());

-- 삭제: 본인 데이터만
CREATE POLICY "bookmarks_delete"
  ON bookmarks FOR DELETE
  USING (user_id = auth.uid());

-- categories: 유저별 개인 카테고리 (마이그레이션 0004)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_select"
  ON categories FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "categories_insert"
  ON categories FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- 0016: PATCH /api/bookmarks/:id의 카테고리 upsert(onConflict) 재배정이 RLS에 막히지 않도록
CREATE POLICY "categories_update"
  ON categories FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "categories_delete"
  ON categories FOR DELETE
  USING (user_id = auth.uid());
```

---

## RPC 함수 — match_bookmarks (A7, A54 하이브리드 병합, A55 카테고리 필터, A58 태그/즐겨찾기 필터)

벡터 코사인 유사도 + pg_trgm 트라이그램 유사도를 RRF(Reciprocal Rank Fusion)로 병합.
순수 벡터 검색은 의미 유사도만 보므로 정확 단어 매칭에 약함 — 트라이그램으로 키워드 매칭을 보강.
한글은 형태소 분석 없는 tsvector('simple' config)보다 트라이그램 부분 문자열 매칭이 더 적합해 선택.
`p_category_id`/`p_uncategorized`로 현재 선택된 카테고리(또는 미분류) 안에서만 검색 — `GET /api/bookmarks`와 동일 시맨틱.
`p_tags`/`p_is_favorite`로 사이드바 태그·즐겨찾기 필터도 검색에 그대로 유지(A58).
절대 코사인 threshold는 사용하지 않음(A55 후속, 0015) — top-K 상대 gap(0.03)/절대 floor(0.5)로 컷(0022에서 강화, 노이즈 밴드 0.3~0.48 회피).

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS bookmarks_title_trgm_idx
  ON bookmarks
  USING gin (title gin_trgm_ops);

-- A60 후속(0018): description도 trgm 검색 대상 — description에만 있는 단어 정확 매칭용
CREATE INDEX IF NOT EXISTS bookmarks_description_trgm_idx
  ON bookmarks
  USING gin (description gin_trgm_ops)
  WHERE description IS NOT NULL;

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
  category      text,     -- 0025: 카테고리 이름(categories 조인) — 검색 카드 칩 표시용
  folder_hint   text[],   -- 0025
  is_dead       boolean,  -- 0025: 링크끊김 배지 표시용
  rrf_score     float     -- 0025: API 병합·정렬 기준(하이브리드 랭킹 노출)
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
    b.id, b.title, b.url, b.description, b.thumbnail_url,
    b.tags, b.category_id, b.is_favorite, b.created_at,
    COALESCE(c.vec_sim, 0) AS similarity,
    cat.name AS category, b.folder_hint, b.is_dead,
    c.rrf_score::float AS rrf_score
  FROM combined c
  JOIN bookmarks b ON b.id = c.id
  LEFT JOIN categories cat ON cat.id = b.category_id
  WHERE c.matched_trgm OR (c.vec_sim >= 0.5 AND c.vec_sim >= c.top_vec_sim - 0.03)
  ORDER BY c.rrf_score DESC
  LIMIT match_count;
$$;
```

> `<=>` = cosine distance 연산자. `<%`/`word_similarity` = pg_trgm 단어 단위 유사도(짧은 쿼리 과소평가 방지, 0.3 threshold의 `%`/`similarity()` 대체). `embedding` 컬럼은 반환하지 않음.
> 정렬 기준은 RRF 점수. 벡터 매칭은 top-K(`GREATEST(match_count*5, 50)`)만 먼저 추리고, 최종 컷은 절대 threshold 대신 `matched_trgm`이거나 `vec_sim >= 0.5 AND top_vec_sim - 0.03` 이내인 것만 통과.
> trgm 매칭 대상은 title/tags/description 3곳(A60 후속, 0018) — title에 키워드 없고 tags·description에만 있는 북마크도 검색됨.
> `p_category_id`/`p_uncategorized`/`p_tags`/`p_is_favorite` 미지정(기본값) 시 해당 필터 없음 — 기존 전체 검색과 동일.
> trgm 매칭은 `<%` 연산자(GUC 의존) 대신 `word_similarity() >= 0.6` 명시 비교로 구현(0023,
> 원격 managed role이 함수 레벨 GUC SET 권한 없어서 `<%`+GUC 조합 배포 불가했음). title/description/
> tags 전부 동일 0.6 — 원래 `<%` 기본 GUC 값과 수학적으로 동일, 회귀 없음.
> 0.65/0.7/태그만 0.85 전부 시도했으나 철회 — "Codex"↔"Claude Code"(0.667) 오탐은 막지만
> "3D"↔"3D모델링"·"영상"↔"영상편집"·"커서"↔"커서AI"·"에르메스"↔"헤르메스 에이전트"·
> "옵시디안"↔"옵시디언" 등 의도된 상위/하위·표기변형 태그 관계가 같은 점수대(0.6~0.8)라
> 함께 깨짐(단일 threshold로 "우연한 겹침"과 "의도된 관련어" 구분 불가).
> `<%` 미사용으로 trgm GIN 인덱스는 못 타지만 현재 규모(수백~수천 건)에선 무시 가능.
> Codex/Claude Code 트라이그램 오탐은 `search_trgm_tag_exclusions` 예외 테이블(0024)로 태그
> 채널만 차단 — title/description에 "Claude Code" 문자열이 그대로 들어간 경우는 자유텍스트라
> 정확일치 예외처리 불가, 미해결로 남음(front/scripts 등 후속 처리 필요 시 참고).
> 유사 오탐 추가 발견 시 `search_trgm_tag_exclusions`에 `(term_a, term_b)` 행만 추가하면 됨.
> 전체 구현: `supabase/migrations/0009_hybrid_search.sql`, `0010_search_category_filter.sql`,
> `0014_search_tags_favorite_filter.sql`, `0015_search_ranking_tags_favorite.sql`, `0018_search_description_trgm.sql`,
> `0019_search_return_description_thumbnail.sql`, `0022_search_tighten_vector_threshold.sql`,
> `0023_search_word_similarity_threshold.sql`, `0024_search_trgm_tag_exclusions.sql`,
> `0025_search_return_rrf_and_card_fields.sql`(rrf_score·category·folder_hint·is_dead 반환 —
> API가 RRF 랭킹을 유지한 채 병합하고 검색 카드에서 카테고리 칩·링크끊김 배지가 소실되지 않도록).

trgm 오탐 예외 테이블(0024) — `match_bookmarks`가 태그 매칭 시 참조:

```sql
-- (query_text, tag) 쌍이 trgm상 우연히 겹치지만 의미 무관한 경우 태그 채널만 차단.
-- 대칭 처리 — (term_a, term_b)와 (term_b, term_a) 양방향 모두 매칭에서 제외.
CREATE TABLE IF NOT EXISTS search_trgm_tag_exclusions (
  term_a text NOT NULL,
  term_b text NOT NULL,
  PRIMARY KEY (term_a, term_b)
);
```

### 검색 품질 평가 (search-eval)

> 관련: `front/lib/search-eval.ts`(채점 함수), `front/eval/search-golden.json`(골든셋),
> `front/lib/__tests__/search-eval.test.ts`(러너). `front/lib/tag-eval.ts` 패턴 미러.

골든셋 6개 카테고리(exact/synonym/cross-lingual/weak-vector/tag-only/noise), 북마크 20건 + 쿼리 14건.
`scoreQuery`/`aggregateSearch`(순수 함수, I/O 없음)로 recall/MRR 채점 — 노이즈 쿼리는 "결과 없음"이 정답으로 반전 채점.

`match_bookmarks` RPC 호출 시 `p_tags`/`p_is_favorite`를 생략하면 위 함수의 구버전 오버로드(0009~0010 시절 6-param)와
모호성 충돌이 나므로, 호출부는 항상 8개 파라미터를 전부 명시해야 함(`app/api/search/route.ts` 참고).

실행: `RUN_SEARCH_EVAL=1 npx vitest run lib/__tests__/search-eval.test.ts` — 비용·DB 쓰기(throwaway auth user +
골든 북마크 20건 삽입, `finally`에서 정리) 때문에 태그 골든셋(`RUN_TAG_EVAL`)과 동일하게 기본 실행에서 제외.

실측(text-embedding-3-small): exact·synonym·cross-lingual·tag-only·noise 전부 1.0, weak-vector만 0 —
description 없는 북마크는 title-only 임베딩이라 의미 검색 재현 안 되는 구조적 한계(회귀 아님, known limitation).
N-2(2026-07-15, 5dfccf3): weak-vector 표본 1→3 확대(n=12→14), 최악 시 overall recall 11/14=0.786.
회귀 게이트는 이 실패를 전제로 분리: `OVERALL_RECALL_BASELINE=0.75`(0.83에서 분모 확대 재보정), `NON_WEAK_VECTOR_RECALL_BASELINE=0.9`.

---

## 카테고리 구조

`categories`는 **유저별 개인 카테고리** (전역 고정 목록 아님). 신규 유저는 카테고리 0개로 시작.

북마크 저장(`POST /api/bookmarks`)·임포트(`/api/bookmarks/import`) 시 AI 태그에서 추출한 대분류(`extractTopCategory`, 배열 내 위치 무관) 이름으로 `categories`를 `(user_id, name)` upsert → 자동 생성 후 `category_id` 매핑.

사이드바 카테고리 목록은 별도 시드가 아니라 보유 북마크의 `category_id` 조인 집계 기반으로 동적 구성 (PR #79).

`tags = []` 이면 카테고리 미생성, `category_id: null` (미분류).

## folder_hint 구조

크롬 북마크 import 시 원본 폴더 경로 보존. `category_id`와 별개의 연결고리.

```
원본 경로: 북마크 바 > 개발 > 프론트엔드
→ 기본 폴더 제거: ["개발", "프론트엔드"]
→ folder_hint: ["개발", "프론트엔드"]
→ category_id: AI 태그에서 추출한 대분류 기준 (폴더명 아님)
```

크롬 기본 폴더(북마크 바·다른 북마크·모바일 북마크) 제거 후 저장. 폴더 없는 북마크는 `folder_hint: null`.

### 내 폴더 목록 쿼리 (A31)

사이드바 내 폴더 드롭다운에 표시할 최상위 폴더 목록 조회:

```sql
-- folder_hint[1] = 최상위 폴더 이름 (1-based index in PostgreSQL)
SELECT DISTINCT folder_hint[1] AS folder_name
FROM bookmarks
WHERE user_id = $1
  AND folder_hint IS NOT NULL
  AND cardinality(folder_hint) > 0
ORDER BY folder_name;
```

> 노출 조건: 결과가 1건 이상일 때만 사이드바 "내 폴더" 섹션 노출. 빈 결과면 숨김.

---

## 탈퇴 시 데이터 파기 (A14)

```sql
-- auth.users ON DELETE CASCADE로 자동 파기
-- 수동 파기 순서 (service_role 필요):
DELETE FROM bookmarks WHERE user_id = $1;
-- 그 후: supabase.auth.admin.deleteUser(userId)
```

---

## RPC 함수 — 관리자 대시보드 집계 (A67, 마이그레이션 0026)

`/admin` 내부 대시보드 전용. 전체 사용자 집계를 위해 `security definer` + `set search_path = public`로 RLS를 우회하되, **`service_role`에만 execute 권한을 부여하고 `PUBLIC`/`anon`/`authenticated`는 명시적으로 회수**한다(PostgreSQL이 `CREATE FUNCTION` 시 `PUBLIC`에 자동 부여하는 기본 권한까지 회수해야 PostgREST 미인증 호출 경로가 완전히 차단됨). 반환은 집계값만 — `embedding`/`content`/개별 `user_id` 행 노출 없음.

```sql
-- OKR 실측: 활성 사용자·첫 저장 완료율(누적 활성화율, 윈도우 내 저장 아님)·1인당 저장·신규 저장
CREATE OR REPLACE FUNCTION admin_okr_stats(p_interval text)
RETURNS TABLE(active_users bigint, first_save_rate numeric, saves_per_user numeric, new_saves bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ ... $$;

-- 카테고리 분포: categories가 유저별 테이블이라 name 기준 집계, category_id IS NULL → '미분류'
CREATE OR REPLACE FUNCTION admin_category_stats(p_interval text)
RETURNS TABLE(name text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ ... $$;

-- 카테고리 드릴다운: tags 배열 unnest로 하위 태그 분포
CREATE OR REPLACE FUNCTION admin_tag_stats(p_category text, p_interval text)
RETURNS TABLE(tag text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ ... $$;

GRANT EXECUTE ON FUNCTION admin_okr_stats(text) TO service_role;
GRANT EXECUTE ON FUNCTION admin_category_stats(text) TO service_role;
GRANT EXECUTE ON FUNCTION admin_tag_stats(text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION admin_okr_stats(text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION admin_category_stats(text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION admin_tag_stats(text, text) FROM anon, authenticated, public;
```

전체 정의: `supabase/migrations/0026_admin_stats_functions.sql`.

**알려진 후속 개선 사항 (비차단, 이번 범위 밖):**
- `bookmarks.created_at`에 별도 인덱스 없음 — 현재는 저트래픽 내부 페이지라 허용, 테이블 성장 시 `created_at` btree 인덱스 추가 검토.
- `admin_category_stats`/`admin_tag_stats`는 count=1인 희귀 라벨도 그대로 노출 — 사용자 자유입력 태그가 다수 유저에 걸쳐 집계되므로, 필요 시 최소 count 임계값 또는 "기타" 버킷 도입 검토.

---

## 관리자 판별 — admin_users 테이블 (A67, 마이그레이션 0027)

`ADMIN_USER_IDS` env var allowlist를 **폐기**하고 DB 테이블 기반으로 전환. redeploy 없이 승격/강등, 감사 추적(`granted_by`/`granted_at`) 확보.

```sql
CREATE TABLE admin_users (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id),
  granted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
-- 정책 0개 = 기본 거부. service_role만 RLS 우회로 직접 접근·관리.

-- authenticated 세션이 본인 관리자 여부를 확인하는 유일한 통로.
CREATE OR REPLACE FUNCTION is_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS(SELECT 1 FROM admin_users WHERE user_id = p_user_id) $$;

GRANT EXECUTE ON FUNCTION is_admin(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION is_admin(uuid) FROM anon, public;
```

전체 정의: `supabase/migrations/0027_admin_users.sql`.

**승격/강등:**
```sql
-- 승격
INSERT INTO admin_users (user_id, granted_by) VALUES ('<대상 user.id>', '<승격시킨 관리자 user.id>');
-- 강등
DELETE FROM admin_users WHERE user_id = '<대상 user.id>';
```
service_role 필요(SQL Editor 또는 `createAdminClient()`). 앱 내 self-service 승격 UI는 없음(YAGNI, 필요 시 `POST /api/admin/admins` 후속 추가).

`front/lib/admin-auth.ts`의 `isAdmin(supabase, userId)`가 호출자 세션으로 `is_admin` RPC를 호출 — RPC 에러 시 fail-closed(false).
