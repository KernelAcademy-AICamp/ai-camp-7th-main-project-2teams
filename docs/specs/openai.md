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

// 서버사이드 전용 — 클라이언트 번들 미포함 보장
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})
```

---

## AI 태깅 (A5)

태그 분류 체계: `docs/specs/tag-taxonomy.md` 참조.
대→중→소 계층 구조, 0~3개 생성.
AI 출력 정규화(alias): `docs/specs/alias.md` 참조.

```typescript
import { openai } from '@/lib/openai'

interface TaggingInput {
  title: string
  url: string
  description?: string
}

const SYSTEM_PROMPT = `당신은 북마크 분류기입니다. 웹페이지를 대/중/소 계층으로 분류해 태그 0~3개를 생성합니다.

## 분류 체계
대분류: 개발 · AI/ML · 디자인 · 비즈니스 · 학습 · 쇼핑 · 커뮤니티 · 브랜드
중분류: 대분류 하위 분야 (예: 개발→프론트엔드, AI/ML→RAG)
소분류: 구체적 기술명·고유명사 (예: Next.js, pgvector, 프롬프트엔지니어링)

## 태그 수 규칙
- 0개: 내용 파악 불가 (로그인·오류·광고 페이지)
- 1개: 대분류만 명확
- 2개: 대+중 식별 (소가 중과 동일하거나 자명할 때)
- 3개: 대+중+소 모두 명확히 다른 정보일 때

## 출력 규칙
- 순서: 항상 대→중→소
- URL로 자명한 정보는 소분류 생략
- 중분류와 소분류가 같으면 소분류 생략

## 출력
JSON만 반환. 설명 없음.
{"tags": ["대분류", "중분류", "소분류"]}`

async function generateTags({ title, url, description }: TaggingInput) {
  const userContent = [
    `제목: ${title}`,
    `URL: ${url}`,
    description ? `설명: ${description}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 100,
    temperature: 0.2,
  })

  const result = JSON.parse(completion.choices[0].message.content ?? '{}') as {
    tags: string[]
  }

  return result.tags?.slice(0, 3) ?? []
}
```

**프롬프트 응답 예시:**
```json
{ "tags": ["개발", "프론트엔드", "Next.js"] }
{ "tags": ["AI/ML", "RAG", "논문"] }
{ "tags": [] }
```

---

## 임베딩 생성 (A5, A7)

```typescript
async function createEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    // dimensions 생략 시 기본 1536
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

```typescript
// app/api/search/route.ts
export const POST = withAuth(async (req, { user }) => {
  const { query } = await req.json()

  const queryEmbedding = await createEmbedding(query)

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('match_bookmarks', {
    query_embedding: queryEmbedding,
    match_threshold: 0.5,
    match_count: 20,
    p_user_id: user.id,
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
