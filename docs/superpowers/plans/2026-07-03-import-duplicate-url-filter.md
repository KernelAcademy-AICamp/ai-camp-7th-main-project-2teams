# 북마크 임포트 중복 URL 필터링 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 북마크 임포트(`POST /api/bookmarks/import`) 시 이미 저장된 URL과 같은 파일 내부의 중복 URL을 AI 호출 전에 걸러내고, 폴더 경로만 다른 경우 folder_hint만 갱신한다.

**Architecture:** 파싱된 항목을 (1) 배치 내부 dedup(Map, last-wins) → (2) DB 기존 URL 배치 조회(`user_id`+`url IN (...)`, 200개씩 청크) → (3) 존재 URL은 folder_hint 비교 후 완전 스킵 또는 folder_hint만 UPDATE, 신규 URL만 기존 fetchMeta/AI태깅/임베딩/upsert 파이프라인으로 진행. 두 단계 dedup 카운트를 합산해 응답에 `duplicate` 필드로 추가.

**Tech Stack:** Next.js Route Handler, Supabase(postgrest-js), Zod, Vitest.

**설계 문서:** `docs/superpowers/specs/2026-07-03-import-duplicate-url-filter-design.md`

---

## Task 0: 작업 브랜치 생성

**Files:** 없음 (git 브랜치 조작만)

- [ ] **Step 1: develop 기준으로 feature 브랜치 생성**

레포 git 규칙(`.claude/rules/git.md`)상 `develop`/`main` 직접 커밋 금지, feature 브랜치는 반드시 `develop`에서 분기.

```bash
git checkout develop
git pull
git checkout -b fix/import-duplicate-url-filter
```

Expected: `Switched to a new branch 'fix/import-duplicate-url-filter'`

이후 모든 커밋은 이 브랜치에서 진행한다.

---

## Task 1: 테스트 인프라 — Supabase mock에 중복조회/update 지원 추가

**Files:**
- Modify: `front/app/api/bookmarks/import/__tests__/route.test.ts:1-89` (import/mock 선언부 + `makeSupabase` + `beforeEach`)

이 태스크는 새 동작을 테스트하지 않는다. 이후 태스크에서 쓸 mock 뼈대만 추가하고 기존 테스트가 여전히 통과하는지 확인한다.

- [ ] **Step 1: mock 선언부 + `makeSupabase` + `beforeEach`를 아래로 교체**

먼저 1~50번째 줄(`import { describe...` ~ `import { POST } from '../route'` 직전)을 아래로 교체:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// AI 모킹 — 실제 OpenAI 호출 차단
const { generateTags, createEmbedding } = vi.hoisted(() => ({
  generateTags: vi.fn(),
  createEmbedding: vi.fn(),
}))
vi.mock('@/lib/ai', () => ({ generateTags, createEmbedding }))

// A52: 임포트가 fetchMeta로 description 조회 — 실네트워크 차단, 기본 빈 메타 반환
const { fetchMeta } = vi.hoisted(() => ({ fetchMeta: vi.fn() }))
vi.mock('@/lib/fetchMeta', () => ({ fetchMeta }))

// Supabase 모킹: auth + categories 조회 + bookmarks select(중복조회)/upsert/update
const insertSpy = vi.fn() // ponytail: alias kept for backward-compat test assertions
const updateSpy = vi.fn()

// 기존 저장된 URL 목록 — 중복 필터링 테스트에서 시나리오별로 채움
let existingRows: Array<{ url: string; folder_hint: string[] | null }> = []
let existingLookupShouldError = false
let updateShouldError = false

function makeSupabase(user: unknown) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from(table: string) {
      if (table === 'categories') {
        return {
          upsert: () => ({
            select: () => ({
              single: async () => ({ data: { id: 'cat-개발' }, error: null }),
            }),
          }),
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { id: 'cat-개발' }, error: null }),
            }),
          }),
        }
      }
      // bookmarks: select(기존 URL+folder_hint 배치 조회) / upsert(신규 저장) / update(folder_hint 갱신)
      return {
        select() {
          return {
            eq() {
              return {
                async in(_col: string, urls: string[]) {
                  if (existingLookupShouldError) {
                    return { data: null, error: { message: 'lookup failed' } }
                  }
                  const matched = existingRows.filter((r) => urls.includes(r.url))
                  return { data: matched, error: null }
                },
              }
            },
          }
        },
        upsert(payload: unknown) {
          insertSpy(payload)
          return { error: null }
        },
        update(payload: unknown) {
          return {
            eq() {
              return {
                async eq() {
                  updateSpy(payload)
                  if (updateShouldError) return { error: { message: 'update failed' } }
                  return { error: null }
                },
              }
            },
          }
        },
      }
    },
  }
}

let currentUser: unknown = { id: 'u1' }
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => makeSupabase(currentUser),
}))

import { POST } from '../route'
```

다음으로 `beforeEach` 블록(원본 80~89번째 줄)을 아래로 교체:

```ts
  beforeEach(() => {
    currentUser = { id: 'u1' }
    insertSpy.mockReset()
    updateSpy.mockReset()
    generateTags.mockReset()
    createEmbedding.mockReset()
    fetchMeta.mockReset()
    existingRows = []
    existingLookupShouldError = false
    updateShouldError = false
    generateTags.mockResolvedValue(['개발', '프론트엔드'])
    createEmbedding.mockResolvedValue([0.1, 0.2])
    fetchMeta.mockResolvedValue({ title: '', description: '' })
  })
```

- [ ] **Step 2: 기존 테스트 스위트 실행 — 회귀 없는지 확인 (route.ts는 아직 미변경)**

Run: `cd front && npx vitest run app/api/bookmarks/import/__tests__/route.test.ts`
Expected: 기존 14개 테스트 전부 PASS (mock만 확장했을 뿐 route.ts 동작은 그대로라 통과해야 함)

- [ ] **Step 3: Commit**

```bash
git add front/app/api/bookmarks/import/__tests__/route.test.ts
git commit -m "$(cat <<'EOF'
test(import): 중복 URL 필터링 테스트용 supabase mock 확장

bookmarks 테이블 mock에 select(기존 URL+folder_hint 조회)와
update(folder_hint 갱신) 체이닝 추가. 아직 route.ts는 미변경이라
기존 테스트 동작에는 영향 없음.
EOF
)"
```

---

## Task 2: 중복 URL 필터링 — 실패 테스트 작성 → route.ts 구현 → 통과 확인

**Files:**
- Modify: `front/app/api/bookmarks/import/__tests__/route.test.ts` (테스트 추가)
- Modify: `front/app/api/bookmarks/import/route.ts` (전체 로직 추가)

- [ ] **Step 1: SAMPLE_HTML 아래에 배치 내부 중복용 HTML 픽스처 2개 추가**

`front/app/api/bookmarks/import/__tests__/route.test.ts`에서 `SAMPLE_HTML` 상수 정의 바로 다음(원본 75번째 줄, `</DL><p>\`` 다음 줄)에 아래를 추가:

```ts
// 동일 URL이 서로 다른 폴더에 2번 등장 — 배치 내부 중복(폴더 다름) 테스트용
const DUPLICATE_DIFFERENT_FOLDER_HTML = `<DL><p>
  <DT><H3>폴더A</H3>
  <DL><p>
    <DT><A HREF="https://dup.com">Dup A</A>
  </DL><p>
  <DT><H3>폴더B</H3>
  <DL><p>
    <DT><A HREF="https://dup.com">Dup B</A>
  </DL><p>
</DL><p>`

// 동일 URL이 같은 폴더에 2번 등장 — 배치 내부 중복(폴더 같음) 테스트용
const DUPLICATE_SAME_FOLDER_HTML = `<DL><p>
  <DT><H3>폴더A</H3>
  <DL><p>
    <DT><A HREF="https://dup.com">Dup A</A>
    <DT><A HREF="https://dup.com">Dup A2</A>
  </DL><p>
</DL><p>`
```

- [ ] **Step 2: 빈 HTML 테스트의 응답 assertion에 `duplicate: 0` 추가**

`route.test.ts`에서 기존 테스트를 찾아 교체:

```ts
// 변경 전
it('빈 HTML (파싱 0건) → { imported:0, failed:0, skipped:0 }', async () => {
  const res = await POST(makeReq(makeFile('<html><body>no bookmarks</body></html>')))
  expect(res.status).toBe(200)
  const json = await res.json()
  expect(json).toEqual({ imported: 0, failed: 0, skipped: 0 })
  expect(insertSpy).not.toHaveBeenCalled()
})
```

```ts
// 변경 후
it('빈 HTML (파싱 0건) → { imported:0, failed:0, skipped:0, duplicate:0 }', async () => {
  const res = await POST(makeReq(makeFile('<html><body>no bookmarks</body></html>')))
  expect(res.status).toBe(200)
  const json = await res.json()
  expect(json).toEqual({ imported: 0, failed: 0, skipped: 0, duplicate: 0 })
  expect(insertSpy).not.toHaveBeenCalled()
})
```

- [ ] **Step 3: describe 블록 마지막 테스트 다음, 닫는 `})` 직전에 신규 테스트 6개 추가**

```ts
  it('DB 기존 URL 재업로드(폴더 경로 동일) → 완전 스킵, duplicate 카운트', async () => {
    existingRows = [{ url: 'https://nextjs.org/', folder_hint: ['개발'] }]

    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    const json = await res.json()

    expect(json.duplicate).toBe(1)
    expect(json.imported).toBe(1) // example.com만 신규 저장
    expect(generateTags).toHaveBeenCalledTimes(1) // nextjs.org는 AI 호출 없음
    expect(updateSpy).not.toHaveBeenCalled()

    const calls: Array<Array<Record<string, unknown>>> = insertSpy.mock.calls
    expect(calls.some((c) => c[0].url === 'https://nextjs.org/')).toBe(false)
  })

  it('DB 기존 URL, folder_hint 다름 → update만 호출, AI 호출 없음, duplicate 카운트', async () => {
    existingRows = [{ url: 'https://nextjs.org/', folder_hint: ['옛폴더'] }]

    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    const json = await res.json()

    expect(json.duplicate).toBe(1)
    expect(updateSpy).toHaveBeenCalledWith({ folder_hint: ['개발'] })
    expect(generateTags).toHaveBeenCalledTimes(1) // nextjs.org는 AI 호출 없음, example.com만
  })

  it('배치 내부 동일 URL, 폴더 경로 다름 → 마지막 등장 채택, 1회만 upsert, duplicate 카운트', async () => {
    const res = await POST(makeReq(makeFile(DUPLICATE_DIFFERENT_FOLDER_HTML)))
    const json = await res.json()

    expect(json.duplicate).toBe(1)
    expect(insertSpy).toHaveBeenCalledTimes(1)
    expect(insertSpy.mock.calls[0][0].folder_hint).toEqual(['폴더B'])
  })

  it('배치 내부 동일 URL, 폴더 경로 같음 → 1회만 upsert, duplicate 카운트', async () => {
    const res = await POST(makeReq(makeFile(DUPLICATE_SAME_FOLDER_HTML)))
    const json = await res.json()

    expect(json.duplicate).toBe(1)
    expect(insertSpy).toHaveBeenCalledTimes(1)
  })

  it('기존 URL 조회(select().eq().in()) 에러 → fail-open으로 정상 처리', async () => {
    existingLookupShouldError = true

    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.imported).toBe(2)
    expect(json.duplicate).toBe(0)
  })

  it('folder_hint update 에러 → fail-open, duplicate만 집계 (failed 증가 안 함)', async () => {
    existingRows = [{ url: 'https://nextjs.org/', folder_hint: ['옛폴더'] }]
    updateShouldError = true

    const res = await POST(makeReq(makeFile(SAMPLE_HTML)))
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.duplicate).toBe(1)
    expect(json.failed).toBe(0)
  })
```

- [ ] **Step 4: 테스트 실행 — 신규 6개 + 빈 HTML 테스트 FAIL 확인 (RED)**

Run: `cd front && npx vitest run app/api/bookmarks/import/__tests__/route.test.ts`
Expected: 신규 6개 테스트와 "빈 HTML" 테스트 FAIL (route.ts가 아직 `duplicate` 필드/중복 필터링을 구현하지 않았으므로 `json.duplicate`가 `undefined`, `updateSpy` 미호출 등으로 실패). 나머지 기존 테스트는 계속 PASS.

- [ ] **Step 5: `front/app/api/bookmarks/import/route.ts` 전체를 아래 내용으로 교체**

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withAuth } from '@/lib/auth'
import { generateTags, createEmbedding } from '@/lib/ai'
import { normalizeTags, extractTopCategory } from '@/lib/tag-alias'
import { parseNetscapeBookmarks, type ParsedBookmark } from '@/lib/parseNetscapeBookmarks'
import { normalizeUrl } from '@/lib/normalizeUrl'
import { fetchMeta } from '@/lib/fetchMeta'

// 대량 임포트 중 OpenAI 호출이 누적되므로 Vercel Pro 최대값(300s) 지정
export const maxDuration = 300

/** 허용 파일 크기 상한 (5MB) */
const MAX_FILE_SIZE = 5 * 1024 * 1024
/** 처리량 상한 — 초과분은 skipped로 보고 */
const MAX_ITEMS = 500
/** OpenAI rate limit 방어를 위한 동시 처리 청크 크기 */
const CHUNK_SIZE = 5
/** 기존 URL 존재 여부 배치 조회 시 IN절 청크 크기 */
const EXISTING_LOOKUP_CHUNK = 200

// file 필드 존재 + 타입 검증 (400). 크기는 별도 413 처리.
const fileSchema = z.object({
  file: z
    .instanceof(File, { message: '파일 필드가 없습니다' })
    .refine(
      (f) => f.type === 'text/html' || f.name.endsWith('.html'),
      { message: 'HTML 파일만 허용됩니다' },
    ),
})

type CandidateBookmark = ParsedBookmark & { url: string }

// 배치 내부 중복 제거 — 동일 URL 재등장 시 마지막 등장으로 덮어씀(folder_hint 최신 반영).
// normalizeUrl 기준으로 키를 잡아 이후 단계(DB 조회·insert)에서 재정규화하지 않는다.
function dedupeBatch(
  items: ParsedBookmark[],
): { candidates: Map<string, CandidateBookmark>; duplicate: number } {
  const candidates = new Map<string, CandidateBookmark>()
  let duplicate = 0
  for (const item of items) {
    const url = normalizeUrl(item.url)
    if (candidates.has(url)) duplicate++
    candidates.set(url, { ...item, url })
  }
  return { candidates, duplicate }
}

// 기존 저장된 URL + folder_hint 배치 조회. 조회 실패(에러) 시 fail-open —
// 해당 청크는 중복 체크 없이 넘어가고 전체 임포트는 중단하지 않는다.
async function fetchExistingByUrl(
  supabase: SupabaseClient,
  userId: string,
  urls: string[],
): Promise<Map<string, string[] | null>> {
  const existing = new Map<string, string[] | null>()
  for (let i = 0; i < urls.length; i += EXISTING_LOOKUP_CHUNK) {
    const slice = urls.slice(i, i + EXISTING_LOOKUP_CHUNK)
    const { data, error } = await supabase
      .from('bookmarks')
      .select('url, folder_hint')
      .eq('user_id', userId)
      .in('url', slice)
    if (error) continue
    for (const row of (data ?? []) as Array<{ url: string; folder_hint: string[] | null }>) {
      existing.set(row.url, row.folder_hint)
    }
  }
  return existing
}

// null↔[] 동일 취급, 배열 순서까지 완전 일치해야 "같음"
function foldersEqual(a: string[] | null, b: string[] | null): boolean {
  const normA = a && a.length > 0 ? a : null
  const normB = b && b.length > 0 ? b : null
  return JSON.stringify(normA) === JSON.stringify(normB)
}

// FormData 'file' 필드로 Netscape 북마크 HTML을 받아 배치 저장.
// A52: 각 URL을 fetchMeta로 조회해 description 확보 → 태깅·임베딩 입력 보강.
//      description은 태깅/임베딩 스코프 내에서만 사용 후 파기 — DB 저장·로그 금지(프라이버시).
// 중복 URL(DB 기존·배치 내부)은 AI 호출 전에 걸러냄 — 완전 스킵하거나 folder_hint만 갱신.
// 응답: { imported, failed, skipped, duplicate } — embedding/content/description 절대 미포함.
export const POST = withAuth(async (req, { user, supabase }) => {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: '파일 업로드 파싱 실패' }, { status: 400 })
  }

  // Zod safeParse: 파일 존재 여부 + MIME/확장자 검증 → 400
  const parsed = fileSchema.safeParse({ file: formData.get('file') })
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }
  const file = parsed.data.file

  // 크기 초과는 HTTP 의미론적으로 413 (Zod와 별도 처리)
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: '파일 크기가 5MB를 초과합니다' },
      { status: 413 },
    )
  }

  const html = await file.text()
  const allBookmarks = parseNetscapeBookmarks(html)

  if (allBookmarks.length === 0) {
    return NextResponse.json({ imported: 0, failed: 0, skipped: 0, duplicate: 0 })
  }

  // 상한 초과분은 잘라내고 skipped 카운트로 보고
  const skipped = Math.max(0, allBookmarks.length - MAX_ITEMS)
  const items = allBookmarks.slice(0, MAX_ITEMS)

  // 배치 내부 중복 제거 (마지막 등장의 folder_hint 채택)
  const { candidates, duplicate: batchDuplicate } = dedupeBatch(items)
  let duplicate = batchDuplicate

  // 기존 저장된 URL 배치 조회 — AI 호출 전 사전 필터링
  const existingByUrl = await fetchExistingByUrl(supabase, user.id, [...candidates.keys()])

  const toProcess: CandidateBookmark[] = []

  await Promise.all(
    [...candidates.values()].map(async (item) => {
      if (!existingByUrl.has(item.url)) {
        toProcess.push(item)
        return
      }

      // 이미 DB에 존재 — folder_hint 비교 후 완전 스킵 또는 folder_hint만 갱신
      duplicate++
      const existingFolderHint = existingByUrl.get(item.url) ?? null
      const newFolderHint = item.folder_hint.length > 0 ? item.folder_hint : null
      if (foldersEqual(existingFolderHint, newFolderHint)) return

      try {
        await supabase
          .from('bookmarks')
          .update({ folder_hint: newFolderHint })
          .eq('user_id', user.id)
          .eq('url', item.url)
      } catch {
        // fail-open — folder_hint 갱신 실패는 duplicate로만 집계, failed 증가 안 함
      }
    }),
  )

  let imported = 0
  let failed = 0

  // category_id 조회 메모이즈 — 최대 6대분류 고정이므로 N+1 방지
  const categoryCache = new Map<string, string | null>()

  // CHUNK_SIZE개씩 청크로 나눠 처리 — OpenAI rate limit 방어
  for (let i = 0; i < toProcess.length; i += CHUNK_SIZE) {
    const chunk = toProcess.slice(i, i + CHUNK_SIZE)

    await Promise.all(
      chunk.map(async ({ title, url, folder_hint }) => {
        try {
          // A52: URL 메타 조회 → description 확보(태깅 굶김 해소). fetchMeta는 throw 안 함(실패=빈 값),
          // 내부 5s 타임아웃. description은 아래 태깅·임베딩 입력으로만 쓰고 저장·로그하지 않음.
          // ponytail: 항목당 최대 5s(죽은 URL) 추가 — 청크 동시성(CHUNK_SIZE)이 상한. 대량+저속 URL로
          //           maxDuration(300s) 압박 시 백그라운드 큐로 승격(현재는 인라인으로 충분).
          const meta = await fetchMeta(url)
          const description = meta.description || undefined

          const [tagsResult, embeddingResult] = await Promise.allSettled([
            generateTags({ title, url, description }),
            createEmbedding(description ? `${title}\n${description}` : title),
          ])

          // 임베딩 실패 → 검색 불가 북마크 → 해당 항목만 실패 처리, 전체 중단 금지
          if (embeddingResult.status === 'rejected') {
            failed++
            return
          }

          const embedding = embeddingResult.value
          // 태깅 실패는 빈 태그로 degrade.
          // A5(단건)와 달리 임포트는 임베딩 실패 시에도 전체 중단하지 않고 해당 항목만 실패 처리.
          const rawTags = tagsResult.status === 'fulfilled' ? tagsResult.value : []
          const { category: top, midTags: tags } = extractTopCategory(normalizeTags(rawTags))
          let category_id: string | null = null
          if (top) {
            if (categoryCache.has(top)) {
              category_id = categoryCache.get(top)!
            } else {
              // 유저 카테고리 upsert (없으면 생성, 있으면 id만 반환)
              const { data: category } = await supabase
                .from('categories')
                .upsert({ name: top, user_id: user.id }, { onConflict: 'user_id,name' })
                .select('id')
                .single()
              category_id = category?.id ?? null
              categoryCache.set(top, category_id)
            }
          }

          // upsert — (user_id, url) unique 제약(A35). 사전 dedup을 통과한 URL만 여기 도달하므로
          // 정상 경로에선 충돌이 없고, ignoreDuplicates:true는 동시 요청 경합 시 마지막 방어선
          // (경합 시 조용히 무시 — 기존 데이터 덮어쓰지 않음, "완전 스킵" 원칙과 일치).
          const { error } = await supabase.from('bookmarks').upsert(
            {
              user_id: user.id,
              title,
              url,
              tags,
              category_id,
              // 루트 항목(빈 배열)은 null 저장 — A5 패턴과 통일
              folder_hint: folder_hint.length > 0 ? folder_hint : null,
              embedding,
            },
            { onConflict: 'user_id, url', ignoreDuplicates: true },
          )

          if (error) {
            failed++
          } else {
            imported++
          }
        } catch {
          // 개별 항목 예외 → 실패 카운트만 증가, 전체 배치 계속
          failed++
        }
      }),
    )
  }

  return NextResponse.json({ imported, failed, skipped, duplicate })
})
```

- [ ] **Step 6: 테스트 재실행 — 전체 PASS 확인 (GREEN)**

Run: `cd front && npx vitest run app/api/bookmarks/import/__tests__/route.test.ts`
Expected: 전체 20개 테스트(기존 14 + 신규 6) PASS

- [ ] **Step 7: Commit**

```bash
git add front/app/api/bookmarks/import/route.ts front/app/api/bookmarks/import/__tests__/route.test.ts
git commit -m "$(cat <<'EOF'
feat(import): 임포트 시 중복 URL 사전 필터링

DB에 이미 있는 URL과 업로드 파일 내부 중복 URL을 AI 태깅/임베딩
호출 전에 걸러낸다. 폴더 경로만 다르면 folder_hint만 UPDATE(다른
필드는 유지), 경로가 같으면 완전 스킵. 응답에 duplicate 카운트 추가.
EOF
)"
```

---

## Task 3: 전체 회귀 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: front 전체 테스트 스위트 실행**

Run: `cd front && npx vitest run`
Expected: 전체 테스트 PASS (다른 라우트/유틸 영향 없음)

- [ ] **Step 2: 타입체크**

Run: `cd front && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: lint**

Run: `cd front && npx eslint app/api/bookmarks/import/route.ts app/api/bookmarks/import/__tests__/route.test.ts`
Expected: 에러 없음 (경고는 기존 컨벤션에 맞으면 허용)

이 태스크는 커밋할 코드 변경이 없으므로 커밋 생략. 실패 항목 발견 시 해당 태스크로 돌아가 수정 후 재실행.

---

## Task 4: PR 준비 (선택 — 사용자 확인 후 진행)

**Files:** 없음

- [ ] **Step 1: 원격에 브랜치 푸시**

```bash
git push -u origin fix/import-duplicate-url-filter
```

- [ ] **Step 2: PR 생성**

레포 PR 규칙(`.claude/rules/git.md`) 형식 준수 — 제목은 Conventional Commits, 본문은 변경사항/관련 이슈/테스트 방법 포함. `gh pr create`로 `develop` 베이스 지정.

이 태스크는 사용자가 명시적으로 push/PR을 요청할 때만 실행한다 (git 원격 작업이므로 자동 진행 금지).
