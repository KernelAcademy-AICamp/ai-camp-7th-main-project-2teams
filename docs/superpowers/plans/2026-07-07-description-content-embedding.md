# description 기본 저장 + 임베딩 content 분리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 북마크 생성 시 og:description을 기본으로 DB에 저장하고, 임베딩 입력은 별도로 "content"(익스텐션 본문 또는 서버 추출 본문, 2000자 상한)를 쓰도록 분리한다.

**Architecture:** `fetchMeta()`에 `content` 필드(og:description + body 텍스트, 2000자 상한, 익스텐션의 기존 규칙과 동일 공식)를 추가한다. 단건 추가·임포트 라우트는 이 `content`를 임베딩/태깅 입력으로 쓰고, `description`은 별도로 DB에 저장한다. 검색 RPC(`match_bookmarks`)는 이미 title+tags+description 트라이그램과 embedding 벡터를 병합하므로 변경 불필요.

**Tech Stack:** Next.js 16 Route Handler, Vitest, Supabase(pgvector), OpenAI(gpt-4o-mini/text-embedding-3-small).

**Spec:** `docs/superpowers/specs/2026-07-07-description-content-embedding-design.md`

---

## 파일 구조

| 파일 | 역할 |
|---|---|
| `front/lib/fetchMeta.ts` | `content` 필드 추가(본문 텍스트 추출 + 2000자 상한) + HTML 엔티티 디코드 |
| `front/lib/__tests__/fetchMeta.test.ts` | 기존 `toEqual` 케이스에 `content` 필드 추가, 신규 content/엔티티 테스트 |
| `front/app/api/bookmarks/route.ts` | 항상 `fetchMeta` 호출, description 저장, embedding 입력을 content로 분리 |
| `front/app/api/bookmarks/__tests__/route.test.ts` | `fetchMeta` 모킹 추가, description/thumbnail/embedding 우선순위 테스트 추가 |
| `front/app/api/bookmarks/import/route.ts` | description을 upsert에 추가, embedding 입력을 `meta.content`로 교체 |
| `front/app/api/bookmarks/import/__tests__/route.test.ts` | A52 테스트를 content 기준으로 갱신, description 저장 테스트 추가 |

---

### Task 1: `fetchMeta.ts` — content 필드 + HTML 엔티티 디코드

**Files:**
- Modify: `front/lib/fetchMeta.ts` (전체 재작성)
- Test: `front/lib/__tests__/fetchMeta.test.ts`

- [ ] **Step 1: 기존 테스트를 새 반환 타입에 맞게 갱신 (RED 유발용 변경)**

`front/lib/__tests__/fetchMeta.test.ts`에서 아래 4개 `toEqual` 호출에 `content` 필드를 추가한다.

```ts
// 1) 'YouTube 오디오 영상 URL → oEmbed title + 채널명 설명' (파일 21-25줄)
expect(meta).toEqual({
  title: '영상 제목',
  description: 'ZeroCho TV 채널',
  thumbnailUrl: '',
  content: 'ZeroCho TV 채널',
})
```

```ts
// 2) '채널 URL → oEmbed 404 → HTML 폴백' (파일 74줄)
expect(meta).toEqual({
  title: 'ZeroCho TV',
  description: '웹 개발 강의',
  thumbnailUrl: '',
  content: '웹 개발 강의',
})
```

```ts
// 3) '<title> + og:description 추출' (파일 86-90줄)
expect(await fetchMeta('https://example.com')).toEqual({
  title: '예시 페이지',
  description: '설명문',
  thumbnailUrl: '',
  content: '설명문',
})
```

```ts
// 4) '응답 실패(!ok) → 빈 값' (파일 103-107줄)
expect(await fetchMeta('https://example.com')).toEqual({
  title: '',
  description: '',
  thumbnailUrl: '',
  content: '',
})
```

```ts
// 5) 'fetch 예외 → 빈 값' (파일 112-116줄)
expect(await fetchMeta('https://example.com')).toEqual({
  title: '',
  description: '',
  thumbnailUrl: '',
  content: '',
})
```

파일 끝(162줄, 마지막 `})` 다음)에 아래 두 `describe` 블록을 추가한다.

```ts
describe('fetchMeta — content(임베딩용 본문 텍스트)', () => {
  it('본문 텍스트를 포함한 content 반환, script/style 텍스트는 제외', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        text:
          '<title>t</title>' +
          '<script>var x = "스크립트 텍스트";</script>' +
          '<style>.a{color:red /* 스타일 텍스트 */}</style>' +
          '<meta property="og:description" content="요약문">' +
          '<body>실제 본문 내용입니다</body>',
      }),
    )
    const meta = await fetchMeta('https://example.com')
    expect(meta.content).toBe('요약문\n실제 본문 내용입니다')
    expect(meta.content).not.toContain('스크립트')
    expect(meta.content).not.toContain('스타일')
  })

  it('본문이 2000자 초과하면 정확히 2000자로 자름', async () => {
    const longBody = '가'.repeat(3000)
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({ ok: true, text: `<body>${longBody}</body>` }),
    )
    const meta = await fetchMeta('https://example.com')
    expect(meta.content).toHaveLength(2000)
  })

  it('og:description 없고 본문만 있으면 content = 본문 텍스트', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({ ok: true, text: '<body>본문만 있음</body>' }),
    )
    const meta = await fetchMeta('https://example.com')
    expect(meta.content).toBe('본문만 있음')
  })

  it('YouTube oEmbed 경로 → content = description(채널명)과 동일', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({ ok: true, json: { title: '영상 제목', author_name: 'ZeroCho TV' } }),
    )
    const meta = await fetchMeta('https://www.youtube.com/watch?v=abc')
    expect(meta.content).toBe('ZeroCho TV 채널')
    expect(meta.content).toBe(meta.description)
  })
})

describe('fetchMeta — HTML 엔티티 디코드', () => {
  it('title/description의 &amp; &quot; &#x2705; 등을 실제 문자로 디코드', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        text:
          '<title>A &amp; B &quot;test&quot;</title>' +
          '<meta property="og:description" content="체크 &#x2705; 완료">',
      }),
    )
    const meta = await fetchMeta('https://example.com')
    expect(meta.title).toBe('A & B "test"')
    expect(meta.description).toBe('체크 ✅ 완료')
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `cd front && npx vitest run lib/__tests__/fetchMeta.test.ts`
Expected: FAIL — 기존 `toEqual` 케이스들이 `content` 키 불일치로 실패, 신규 테스트는 `meta.content is undefined` 등으로 실패.

- [ ] **Step 3: `fetchMeta.ts` 전체 재작성**

`front/lib/fetchMeta.ts` 전체를 아래로 교체한다.

```ts
// 서버사이드 전용 — 외부 URL에서 title/description/content 추출. content 없는 단일 북마크 추가 시 사용.

const FETCH_TIMEOUT_MS = 5000
const MAX_HTML = 50_000 // <head> 파싱에 충분, 대용량 바디 방지
// YouTube 채널 메인 페이지는 <title>/og:title이 ~630KB 지점에 있어 기본 캡으론 누락 → 상향.
const CHANNEL_MAX_HTML = 800_000
// 임베딩 입력용 본문 텍스트 상한 — extension/background/index.js의 동일 규칙과 값 일치.
// 코드 공유는 안 되므로(별도 저장소) 값 바꿀 때 양쪽 다 수정해야 함.
const MAX_CONTENT_LENGTH = 2000

function isYouTube(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return /(^|\.)youtube\.com$/.test(host) || host === 'youtu.be'
  } catch {
    return false
  }
}

// 채널·크리에이터 메인 페이지(/@handle·/channel·/c·/user) — oEmbed 미지원(404)이라 HTML 폴백 필요.
function isYouTubeChannel(url: string): boolean {
  try {
    const u = new URL(url)
    if (!/(^|\.)youtube\.com$/.test(u.hostname)) return false
    return /^\/(@[^/]+|channel\/|c\/|user\/)/.test(u.pathname)
  } catch {
    return false
  }
}

// YouTube는 봇 UA에 동의 페이지를 주거나 SSR title이 없어 HTML 파싱이 불안정 →
// oEmbed(공개 API, 키 불필요)로 영상 제목 + 채널명 + 공식 썸네일 URL 확보. 채널 URL은 oEmbed 404 → null로 폴백(HTML 시도).
async function fetchYouTubeOEmbed(
  url: string,
): Promise<{ title: string; description: string; thumbnailUrl: string } | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      title?: string
      author_name?: string
      thumbnail_url?: string
    }
    if (!data.title) return null
    return {
      title: data.title,
      description: data.author_name ? `${data.author_name} 채널` : '',
      thumbnailUrl: data.thumbnail_url ?? '',
    }
  } catch {
    return null
  }
}

// og:image가 상대경로일 수 있어 page URL 기준으로 절대경로화. http/https 아니면 버림(data: 등 방지).
function resolveImageUrl(raw: string, pageUrl: string): string {
  if (!raw) return ''
  try {
    const resolved = new URL(raw, pageUrl)
    if (resolved.protocol === 'http:' || resolved.protocol === 'https:') return resolved.href
  } catch {}
  return ''
}

// 이름 있는 HTML 엔티티 — meta content 속성값에 그대로 남아있던 버그(&amp; 등 미디코딩) 방지.
const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

// &amp; &#39; &#x2705; 등 이름/숫자/16진 엔티티 참조를 실제 문자로 디코드.
function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] === '#') {
      const codePoint =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10)
      return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint)
    }
    return NAMED_ENTITIES[body] ?? match
  })
}

// 여러 meta 태그 패턴을 순서대로 시도해 첫 content 값 반환 (속성 순서 무관 추출). 엔티티 디코드 포함.
function extractMetaContent(html: string, ...patterns: RegExp[]): string {
  for (const tagRe of patterns) {
    const tag = html.match(tagRe)?.[0]
    const content = tag?.match(/content=["']([^"']{1,1000})["']/i)?.[1]?.trim()
    if (content) return decodeHtmlEntities(content)
  }
  return ''
}

// 임베딩 입력용 "본문 텍스트" 추출 — <title>/<script>/<style> 제외한 나머지 텍스트.
// 익스텐션의 document.body.innerText와 동등한 신호를 서버에서 재현(fetchMeta만 있는 경로 보강).
function extractBodyText(html: string): string {
  const stripped = html
    .replace(/<title[\s\S]*?<\/title>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const text = stripped
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return decodeHtmlEntities(text)
}

// 익스텐션(extension/background/index.js)과 동일 공식 — description + body 결합 후 2000자 상한.
function buildContent(description: string, bodyText: string): string {
  return [description, bodyText].filter(Boolean).join('\n').slice(0, MAX_CONTENT_LENGTH)
}

export async function fetchMeta(url: string): Promise<{
  title: string
  description: string
  thumbnailUrl: string
  content: string
}> {
  // YouTube 영상: oEmbed 우선 (HTML 파싱보다 안정적). 채널 URL이면 null → HTML 폴백.
  if (isYouTube(url)) {
    const oembed = await fetchYouTubeOEmbed(url)
    // oEmbed는 body HTML이 없음 — description(채널명)을 content로 대체해 임베딩 품질 유지.
    if (oembed) return { ...oembed, content: oembed.description }
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BookmarkBot/1.0)' },
    })
    if (!res.ok) return { title: '', description: '', thumbnailUrl: '', content: '' }

    // 유튜브 채널 메인은 head가 커서 캡 상향 (og:title이 50KB 밖)
    const cap = isYouTubeChannel(url) ? CHANNEL_MAX_HTML : MAX_HTML
    const html = (await res.text()).slice(0, cap)

    // <title> 우선, 없으면 og:title → twitter:title
    const rawTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim()
    const title = rawTitle
      ? decodeHtmlEntities(rawTitle)
      : extractMetaContent(
          html,
          /<meta[^>]+property=["']og:title["'][^>]*>/i,
          /<meta[^>]+name=["']twitter:title["'][^>]*>/i,
        )

    // og:description → meta[name=description] → twitter:description
    const description = extractMetaContent(
      html,
      /<meta[^>]+property=["']og:description["'][^>]*>/i,
      /<meta[^>]+name=["']description["'][^>]*>/i,
      /<meta[^>]+name=["']twitter:description["'][^>]*>/i,
    )

    // og:image → twitter:image
    const rawThumbnail = extractMetaContent(
      html,
      /<meta[^>]+property=["']og:image["'][^>]*>/i,
      /<meta[^>]+name=["']twitter:image["'][^>]*>/i,
    )
    const thumbnailUrl = resolveImageUrl(rawThumbnail, url)

    const content = buildContent(description, extractBodyText(html))

    return { title, description, thumbnailUrl, content }
  } catch {
    return { title: '', description: '', thumbnailUrl: '', content: '' }
  }
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `cd front && npx vitest run lib/__tests__/fetchMeta.test.ts`
Expected: PASS (전체 케이스)

- [ ] **Step 5: 커밋**

```bash
git add front/lib/fetchMeta.ts front/lib/__tests__/fetchMeta.test.ts
git commit -m "$(cat <<'EOF'
feat(fetchMeta): 임베딩용 content 필드 추가 + HTML 엔티티 디코드

description(카드 표시용)과 별개로 본문 텍스트를 2000자 상한으로 추출하는
content 필드를 추가. 익스텐션(extension/background/index.js)의 기존
공식과 동일하게 맞춰 단건 추가·임포트 양쪽에서 재사용 가능하게 함.
og:title/description 추출 시 HTML 엔티티(&amp; 등) 미디코딩 버그도 수정.
EOF
)"
```

---

### Task 2: 단건 추가 라우트 — description 저장 + content 우선순위 분리

**Files:**
- Modify: `front/app/api/bookmarks/route.ts:1-118`
- Test: `front/app/api/bookmarks/__tests__/route.test.ts`

- [ ] **Step 1: 테스트 파일에 `fetchMeta` 모킹 추가 + 신규 테스트 작성 (RED)**

`front/app/api/bookmarks/__tests__/route.test.ts` 7번째 줄(`vi.mock('@/lib/logger', ...)` 다음) 뒤에 추가:

```ts
// fetchMeta 모킹 — 실네트워크 차단. 항상 호출되므로(이번 변경) 기본값 반환 필요.
const { fetchMeta } = vi.hoisted(() => ({ fetchMeta: vi.fn() }))
vi.mock('@/lib/fetchMeta', () => ({ fetchMeta }))
```

`beforeEach` 블록(93-104줄) 안, `createEmbedding.mockResolvedValue([0.1, 0.2, 0.3])` 다음 줄에 추가:

```ts
    fetchMeta.mockReset()
    fetchMeta.mockResolvedValue({ title: '', description: '', thumbnailUrl: '', content: '' })
```

파일 끝(203줄, 마지막 `})` 앞, `describe` 블록 안)에 아래 4개 테스트를 추가한다.

```ts
  it('description은 항상 fetchMeta 결과로 저장 (content 유무 무관)', async () => {
    fetchMeta.mockResolvedValueOnce({
      title: '',
      description: '요약',
      thumbnailUrl: '',
      content: '',
    })
    await POST(req({ title: 'T', url: 'https://a.com', content: '본문 있음' }))
    const payload = insertSpy.mock.calls[0][0]
    expect(payload.description).toBe('요약')
  })

  it('익스텐션 content 있어도 thumbnail_url 채워짐 (기존 버그 수정)', async () => {
    fetchMeta.mockResolvedValueOnce({
      title: '',
      description: '',
      thumbnailUrl: 'https://a.com/thumb.jpg',
      content: '',
    })
    await POST(req({ title: 'T', url: 'https://a.com', content: '본문 있음' }))
    const payload = insertSpy.mock.calls[0][0]
    expect(payload.thumbnail_url).toBe('https://a.com/thumb.jpg')
  })

  it('익스텐션 content 있으면 그 값이 임베딩 입력, meta.content는 무시', async () => {
    fetchMeta.mockResolvedValueOnce({
      title: '',
      description: '',
      thumbnailUrl: '',
      content: '서버추출본문',
    })
    await POST(req({ title: 'T', url: 'https://a.com', content: '익스텐션본문' }))
    expect(createEmbedding).toHaveBeenCalledWith('T\n익스텐션본문')
  })

  it('익스텐션 content 없으면 meta.content가 임베딩 입력으로 쓰임', async () => {
    fetchMeta.mockResolvedValueOnce({
      title: '',
      description: '',
      thumbnailUrl: '',
      content: '서버추출본문',
    })
    await POST(req({ title: 'T', url: 'https://a.com' }))
    expect(createEmbedding).toHaveBeenCalledWith('T\n서버추출본문')
  })
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `cd front && npx vitest run app/api/bookmarks/__tests__/route.test.ts`
Expected: FAIL — 신규 4개 테스트 실패(`payload.description`이 `undefined`, thumbnail_url 미반영 등). 기존 테스트는 `fetchMeta` 모킹 덕분에 그대로 통과해야 정상(만약 기존 테스트가 여기서 깨지면 모킹 추가 위치를 재확인).

- [ ] **Step 3: `route.ts` 수정**

`front/app/api/bookmarks/route.ts`의 21-66줄(주석부터 embedding 계산 직전까지)을 아래로 교체한다.

```ts
// 저장 + AI 태깅 + 임베딩. content(본문)는 DB 저장·로그 금지 — 임베딩 계산 후 즉시 파기.
// description(og:description)은 기본 저장(카드 표시·검색용) — content와는 별개 값.
// maskSensitive() 경유 필수 (lib/logger.ts), 응답에 embedding 미포함.
export const POST = withAuth(async (req, { user, supabase }) => {
  const parsed = bookmarkCreateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  let { title, content } = parsed.data
  const { folder_hint } = parsed.data
  // 중복 방지: 정규화된 canonical URL로 저장 (trailing slash·fragment·트래킹파라미터 흡수)
  const url = normalizeUrl(parsed.data.url)

  // 중복 선검사 — 이미 저장된 URL이면 409 (AI 호출 전이라 비용 절약).
  // 조용한 덮어쓰기 대신 명시적 안내. 경합은 아래 insert의 unique 위반(23505)으로 이중 방어.
  const { data: existing } = await supabase
    .from('bookmarks')
    .select('id')
    .eq('user_id', user.id)
    .eq('url', url)
    .maybeSingle()
  if (existing) {
    return NextResponse.json(
      { error: '이미 저장된 북마크입니다.', duplicate: true },
      { status: 409 },
    )
  }

  // description·thumbnail_url은 content 유무와 무관하게 항상 필요 → fetchMeta 항상 호출
  // (기존: content 있으면 스킵 → thumbnail_url이 익스텐션 경로에서 항상 null이었던 버그 수정).
  // title은 익스텐션이 이미 캡처했으면(content 있으면) document.title을 더 신뢰 — meta.title로 덮지 않음.
  const hasExtensionContent = content.trim() !== ''
  const meta = await fetchMeta(url)
  if (!hasExtensionContent && meta.title) title = meta.title
  const description = meta.description || null
  const thumbnailUrl = isSafeHttpUrl(meta.thumbnailUrl) ? meta.thumbnailUrl : null
  // 임베딩 입력 — 익스텐션 content(og:description+body, 2000자 상한) 우선, 없으면 서버 추출본으로 대체.
  const embeddingContent = hasExtensionContent ? content : meta.content

  // A37: PDF·chrome:// 등 content script 차단 + 서버 추출도 실패 → embedding=title만(약한 벡터). 허용 degradation.
  const hasContent = embeddingContent.trim() !== ''
  if (!hasContent) logger.warn('[weak-vector]', { url, title, user_id: user.id, reason: 'content 없음 — title 전용 임베딩' })

  // 태깅 + 임베딩 병렬 실행 → 응답시간 단축. embeddingContent는 이 스코프 안에서만 사용 후 파기.
  const [tagsResult, embeddingResult] = await Promise.allSettled([
    generateTags({ title, url, description: embeddingContent }),
    createEmbedding(hasContent ? `${title}\n${embeddingContent}` : title),
  ])
```

`insert({...})` 호출(원본 88-99줄, `folder_hint: folder_hint ?? null,` 다음 줄)에 `description` 필드를 추가한다.

```ts
  const { data, error } = await supabase
    .from('bookmarks')
    .insert({
      user_id: user.id,
      title,
      url,
      description,
      tags,
      category_id,
      folder_hint: folder_hint ?? null,
      thumbnail_url: thumbnailUrl,
      embedding,
    })
```

파일 상단 import에 `fetchMeta`가 이미 있는지 확인 — 원본 8번째 줄에 이미 `import { fetchMeta } from '@/lib/fetchMeta'`가 있으므로 import 변경은 불필요하다.

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `cd front && npx vitest run app/api/bookmarks/__tests__/route.test.ts`
Expected: PASS (전체 케이스)

- [ ] **Step 5: 커밋**

```bash
git add front/app/api/bookmarks/route.ts front/app/api/bookmarks/__tests__/route.test.ts
git commit -m "$(cat <<'EOF'
feat(bookmarks): 단건 추가 시 description 기본 저장 + content 우선순위 분리

fetchMeta를 content 유무와 무관하게 항상 호출하도록 변경 — description·
thumbnail_url 확보가 더 이상 익스텐션 content 존재 여부에 좌우되지 않음
(익스텐션 경로에서 thumbnail_url이 항상 null이던 버그도 같이 수정).
임베딩 입력은 익스텐션 content 우선, 없으면 fetchMeta의 content로 대체.
EOF
)"
```

---

### Task 3: 임포트 라우트 — description 저장 + embedding 입력을 content로 교체

**Files:**
- Modify: `front/app/api/bookmarks/import/route.ts`
- Test: `front/app/api/bookmarks/import/__tests__/route.test.ts`

- [ ] **Step 1: 테스트 갱신 (RED)**

`front/app/api/bookmarks/import/__tests__/route.test.ts`의 `beforeEach` 안 `fetchMeta.mockResolvedValue({ title: '', description: '' })` 줄(249줄)을 아래로 교체:

```ts
    fetchMeta.mockResolvedValue({ title: '', description: '', content: '' })
```

`'A52: fetchMeta description을 태깅·임베딩 입력으로 전달'` 테스트(271-285줄) 전체를 아래로 교체:

```ts
  it('A52: fetchMeta content를 태깅·임베딩 입력으로 전달', async () => {
    fetchMeta.mockResolvedValue({
      title: 'meta title',
      description: '짧은 요약',
      content: 'Next.js 서버 컴포넌트 가이드 본문',
    })

    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    await readAllEvents(res)

    // 태깅에 content 전달 (title+url 굶김 해소) — generateTags 파라미터명은 description이지만
    // 실제로는 embedding용 content를 받는다(내부 인터페이스 명명, 외부 의미와 무관).
    expect(generateTags).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Next.js 서버 컴포넌트 가이드 본문' }),
    )
    // 임베딩도 title+content 결합 (약한 벡터 개선)
    expect(createEmbedding).toHaveBeenCalledWith(
      expect.stringContaining('Next.js 서버 컴포넌트 가이드 본문'),
    )
  })

  it('description은 embedding 입력과 별개로 upsert payload에 저장됨', async () => {
    fetchMeta.mockResolvedValue({
      title: '',
      description: '카드용 요약',
      content: '임베딩용 본문',
    })

    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    await readAllEvents(res)

    const calls: Array<Array<Record<string, unknown>>> = insertSpy.mock.calls
    calls.forEach((call) => {
      expect(call[0].description).toBe('카드용 요약')
    })
  })
```

`'A52: fetchMeta 빈 description → title 폴백 (description 미전달)'` 테스트(287-297줄)는 그대로 둔다 — 기본 mock(`content: ''`)에서도 동일하게 `description: undefined`, `createEmbedding`이 `'Next.js'` 단독 호출되는 결과라 변경 불필요.

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `cd front && npx vitest run app/api/bookmarks/import/__tests__/route.test.ts`
Expected: FAIL — 새로 바꾼 'A52: fetchMeta content를...' 테스트와 'description은 embedding 입력과 별개로...' 테스트가 실패(현재 코드는 `meta.description`을 태깅/임베딩에 쓰고 upsert에 description 자체가 없음).

- [ ] **Step 3: `import/route.ts` 수정**

파일 상단 주석(93-99줄)을 아래로 교체:

```ts
// FormData 'file' 필드로 Netscape 북마크 HTML을 받아 배치 저장.
// A52: 각 URL을 fetchMeta로 조회해 description(카드 표시용)·content(임베딩 입력, 2000자) 확보.
//      description은 DB 저장(기본값). content(본문 텍스트)는 태깅/임베딩 스코프 내에서만
//      사용 후 파기 — DB 저장·로그 금지(프라이버시).
// 중복 URL(DB 기존·배치 내부)은 AI 호출 전에 걸러냄 — 완전 스킵하거나 folder_hint만 갱신.
// 파일 검증(400/413)과 빈 파싱(0건) 경로는 즉시 JSON 응답. 실제 처리 단계는 SSE 스트림으로
// 항목이 종결 처리될 때마다 progress 이벤트 전송, 마지막에 done 이벤트로 최종 결과 전달.
// progress/done 이벤트 모두 embedding/content/description 절대 미포함.
```

청크 처리 루프 안(이전 턴에 이미 title 승격 로직이 적용된 상태) 아래 블록을:

```ts
                const meta = await fetchMeta(url)
                const description = meta.description || undefined

                // 카카오톡 CSV는 실제 title이 없어 parseKakaoChat이 title=url로 채워 넘김 —
                // 그 placeholder를 여기서 fetchMeta 실제 title로 승격(단건 추가 경로와 동일 패턴).
                // HTML 임포트는 원래 title이 이미 유의미하므로(=url인 경우만 예외) 그대로 유지.
                const title = parsedTitle === url && meta.title ? meta.title : parsedTitle

                // 자체 내보내기 HTML(TAGS 속성 포함)은 AI 재태깅 없이 그대로 복원 — 일반 브라우저
                // 내보내기(TAGS 없음)만 기존처럼 generateTags 호출.
                const tagsPromise = htmlTags ? Promise.resolve(htmlTags) : generateTags({ title, url, description })

                const [tagsResult, embeddingResult] = await Promise.allSettled([
                  tagsPromise,
                  createEmbedding(description ? `${title}\n${description}` : title),
                ])
```

아래로 교체한다:

```ts
                const meta = await fetchMeta(url)
                const description = meta.description || undefined
                // 임베딩 입력 — description(짧은 요약)이 아니라 content(본문 포함, 2000자 상한) 사용.
                const embeddingContent = meta.content || undefined

                // 카카오톡 CSV는 실제 title이 없어 parseKakaoChat이 title=url로 채워 넘김 —
                // 그 placeholder를 여기서 fetchMeta 실제 title로 승격(단건 추가 경로와 동일 패턴).
                // HTML 임포트는 원래 title이 이미 유의미하므로(=url인 경우만 예외) 그대로 유지.
                const title = parsedTitle === url && meta.title ? meta.title : parsedTitle

                // 자체 내보내기 HTML(TAGS 속성 포함)은 AI 재태깅 없이 그대로 복원 — 일반 브라우저
                // 내보내기(TAGS 없음)만 기존처럼 generateTags 호출.
                const tagsPromise = htmlTags
                  ? Promise.resolve(htmlTags)
                  : generateTags({ title, url, description: embeddingContent })

                const [tagsResult, embeddingResult] = await Promise.allSettled([
                  tagsPromise,
                  createEmbedding(embeddingContent ? `${title}\n${embeddingContent}` : title),
                ])
```

upsert 호출(원본 273-285줄 부근) 안 `folder_hint: folder_hint.length > 0 ? folder_hint : null,` 다음 줄에 `description`을 추가한다.

```ts
                const { error } = await supabase.from('bookmarks').upsert(
                  {
                    user_id: user.id,
                    title,
                    url,
                    description: description ?? null,
                    tags,
                    category_id,
                    // 루트 항목(빈 배열)은 null 저장 — A5 패턴과 통일
                    folder_hint: folder_hint.length > 0 ? folder_hint : null,
                    embedding,
                    thumbnail_url: meta.thumbnailUrl || null,
                  },
                  { onConflict: 'user_id, url', ignoreDuplicates: true },
                )
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `cd front && npx vitest run app/api/bookmarks/import/__tests__/route.test.ts`
Expected: PASS (전체 케이스)

- [ ] **Step 5: 커밋**

```bash
git add front/app/api/bookmarks/import/route.ts front/app/api/bookmarks/import/__tests__/route.test.ts
git commit -m "$(cat <<'EOF'
feat(import): description 기본 저장 + embedding 입력을 content로 교체

임포트 라우트가 fetchMeta의 description을 태깅/임베딩에만 쓰고 버리던
것을 description은 DB에 저장, embedding/태깅 입력은 content(본문 포함,
2000자 상한)로 분리. 검색 정확도 향상 + 카드에 description 표시됨.
EOF
)"
```

---

### Task 4: 전체 회귀 확인

**Files:** 없음(검증 전용)

- [ ] **Step 1: front 전체 테스트 실행**

Run: `cd front && npx vitest run`
Expected: 전체 PASS. 특히 `lib/__tests__/ai.mock.test.ts`, `app/api/bookmarks/[id]/__tests__/*`(존재 시), `app/api/search/__tests__/*`(존재 시)에서 description 관련 회귀가 없는지 확인.

- [ ] **Step 2: 타입체크**

Run: `cd front && npx tsc --noEmit`
Expected: 에러 없음 — `fetchMeta` 반환 타입에 `content` 추가로 인한 타입 불일치가 없는지 확인(호출부는 모두 구조분해로 필요한 필드만 꺼내 쓰므로 영향 없어야 함).

- [ ] **Step 3: 린트**

Run: `cd front && npx eslint lib/fetchMeta.ts app/api/bookmarks/route.ts app/api/bookmarks/import/route.ts`
Expected: 에러 없음.

---

## 스펙 커버리지 체크 (self-review)

- description 기본 저장(단건+임포트): Task 2·3
- embedding content 2000자 규칙, 익스텐션 우선/서버 폴백: Task 1(추출)·Task 2(우선순위)
- 검색 통합: 스펙에서 이미 "코드 변경 불필요"로 확인됨 — 별도 태스크 없음(의도된 누락)
- thumbnail_url 부수 버그 수정: Task 2
- HTML 엔티티 디코드: Task 1

플레이스홀더/모호한 지시 없음 — 모든 스텝에 실행 가능한 코드·명령 포함.
