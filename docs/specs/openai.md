# OpenAI SDK 스펙

**관련 태스크**: A5, A7, A8

---

## 패키지

```bash
npm install openai
```

---

## 클라이언트 초기화

```typescript
// lib/openai.ts
import OpenAI from 'openai'

// 서버사이드 전용 — 클라이언트 번들 미포함 보장 (OPENAI_API_KEY는 NEXT_PUBLIC_ 금지).
// 지연 초기화: 첫 호출 시 생성 → 키 없는 빌드 단계 throw 방지.
let client: OpenAI | null = null

export function getOpenAI(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return client
}
```

---

## AI 태깅 (A5)

태그 분류 체계: `docs/specs/tag-taxonomy.md` 참조.
대→중→소 계층 구조, 0~3개 생성.
AI 출력 정규화(alias): `docs/specs/alias.md` 참조.

```typescript
import { getOpenAI } from '@/lib/openai'

interface TaggingInput {
  title: string
  url: string
  description?: string
}

// SYSTEM_PROMPT 전문·Few-shot 예제·경계 규칙은 lib/ai.ts 단일 출처. 분류 체계는 tag-taxonomy.md.
const completion = await getOpenAI().chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent }, // 제목·URL·설명
  ],
  response_format: { type: 'json_object' },
  max_tokens: 200, // confidence 필드 포함 — truncation 방지
  temperature: 0, // 분류 결정성(같은 URL→같은 태그)
})

// 태그별 confidence 부여 → threshold(0.6) 미만 제외(selectConfidentTags). normalizeTags 후 저장.
return selectConfidentTags(JSON.parse(completion.choices[0].message.content ?? '{}'))
```

**출력 형식 (현행):** 각 태그에 0~1 confidence. `selectConfidentTags`가 0.6 이상만 통과.
```json
{ "tags": [
  { "tag": "개발", "confidence": 0.95 },
  { "tag": "프론트엔드", "confidence": 0.85 },
  { "tag": "Next.js", "confidence": 0.8 }
] }
```
대분류 13종·중분류·경계 규칙·Few-shot 예제는 `lib/ai.ts` SYSTEM_PROMPT 참조.

---

## 임베딩 생성 (A5, A7)

```typescript
async function createEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-large', // 2026-07-22 3-small→3-large 전환 (A/B: recall@10 0.70→0.85)
    dimensions: 1536, // 기본 3072를 축소 출력 — vector(1536) 스키마·인덱스 유지
    input: text,
  })
  return response.data[0].embedding
}
```

---

## 병렬 실행 패턴 (A5 핵심)

```typescript
// app/api/bookmarks/route.ts
export const POST = withAuth(async (req, { user }) => {
  const { title, url, content, folder_hint } = await req.json()

  // content 로그 마스킹 (A8)
  console.log('[bookmark] 저장 요청', { title, url, content: '[REDACTED]' })

  // 태깅 + 임베딩 병렬 실행 → 응답시간 단축
  const [tags, embedding] = await Promise.all([
    generateTags({ title, url }),
    createEmbedding(`${title}\n${content}`),
  ])

  // content는 여기서 파기됨 — DB 저장 안 함

  // tags[0] → category_id 조회
  const supabase = await createClient()
  const { data: category } = tags[0]
    ? await supabase.from('categories').select('id').eq('name', tags[0]).single()
    : { data: null }

  const { data, error } = await supabase
    .from('bookmarks')
    .insert({
      user_id: user.id,
      title,
      url,
      tags,
      category_id: category?.id ?? null,
      folder_hint: folder_hint ?? null,
      embedding,
    })
    .select('id, tags, category_id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
})
```

---

## 벡터 검색 임베딩 (A7)

절대 코사인 threshold(`match_threshold`)는 사용하지 않음 — top-K(`SEARCH_TOP_K=60`) + RPC 내부 상대 gap/절대 floor로 컷(A55 후속, `database.md` 참조). `p_category_id`/`p_uncategorized`(A55), `p_tags`/`p_is_favorite`(A58)로 사이드바 필터를 검색에도 유지.

```typescript
// app/api/search/route.ts
const SEARCH_TOP_K = 60

export const POST = withAuth(async (req, { user, supabase }) => {
  const { query } = parsed.data // searchSchema — query/category/tag/is_favorite

  const queryEmbedding = await createEmbedding(query)

  const { data, error } = await supabase.rpc('match_bookmarks', {
    query_embedding: queryEmbedding,
    query_text: query,
    match_count: SEARCH_TOP_K,
    p_user_id: user.id,
    p_category_id: categoryId,
    p_uncategorized: uncategorized,
    p_tags: tags,
    p_is_favorite: isFavorite,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ results: data })
})
```

---

## Zero Data Retention 확인 (A8)

API 기본값: 학습 미사용. 확인 경로:
- `platform.openai.com` → **Settings** → **Data Controls**
- "Improve model for everyone" 비활성화 확인

코드레벨 보장:
1. `content` 컬럼 DB에 없음 (`database.md` 참조)
2. 로그에 `content` 값 출력 금지
3. `Promise.all` 완료 후 `content` 변수는 GC 대상

---

## 에러 처리

```typescript
import { APIError } from 'openai'

try {
  const result = await openai.chat.completions.create(...)
} catch (err) {
  if (err instanceof APIError) {
    if (err.status === 429) {
      // Rate limit — 재시도 또는 503 반환
    }
    if (err.status === 400) {
      // 입력 토큰 초과 — content 길이 줄이기
    }
  }
  throw err
}
```
