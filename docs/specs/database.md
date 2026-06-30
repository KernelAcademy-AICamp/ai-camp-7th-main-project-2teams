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
-- 유저별 개인 카테고리 (시드 없음, 북마크 저장/임포트 시 AI tags[0] 기반 자동 생성)
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
  category_id UUID        REFERENCES categories(id),   -- tags[0] 매핑, null = 미분류
  folder_hint TEXT[],                                   -- 크롬 폴더 경로 (파일 임포트 시 원본 경로 보존)
  is_favorite BOOLEAN     NOT NULL DEFAULT false,       -- 즐겨찾기 토글 (A27)
  embedding   vector(1536),                              -- text-embedding-3-small (A51 bge-m3 롤백, 마이그레이션 0006)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
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

CREATE POLICY "categories_delete"
  ON categories FOR DELETE
  USING (user_id = auth.uid());
```

---

## RPC 함수 — match_bookmarks (A7)

```sql
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
```

> `<=>` = cosine distance 연산자. `embedding` 컬럼은 반환하지 않음.

---

## 카테고리 구조

`categories`는 **유저별 개인 카테고리** (전역 고정 목록 아님). 신규 유저는 카테고리 0개로 시작.

북마크 저장(`POST /api/bookmarks`)·임포트(`/api/bookmarks/import`) 시 AI `tags[0]` 이름으로 `categories`를 `(user_id, name)` upsert → 자동 생성 후 `category_id` 매핑.

사이드바 카테고리 목록은 별도 시드가 아니라 보유 북마크의 `tags[0]` 기반으로 동적 구성 (PR #79).

`tags = []` 이면 카테고리 미생성, `category_id: null` (미분류).

## folder_hint 구조

크롬 북마크 import 시 원본 폴더 경로 보존. `category_id`와 별개의 연결고리.

```
원본 경로: 북마크 바 > 개발 > 프론트엔드
→ 기본 폴더 제거: ["개발", "프론트엔드"]
→ folder_hint: ["개발", "프론트엔드"]
→ category_id: tags[0] 기준 (폴더명 아님)
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
