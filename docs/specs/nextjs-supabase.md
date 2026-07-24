# Next.js 16 + @supabase/ssr 스펙

**관련 태스크**: A2, A3, A4, A5, A6, A7, A14, A15, A26, A27, A28, A29, A30, A31

---

## 패키지

```bash
npx create-next-app@latest front --typescript --tailwind --app
cd front
npm install @supabase/ssr@latest @supabase/supabase-js@latest
npm install @tanstack/react-query@latest zustand@latest zod@latest lucide-react@latest
npm install -D @tanstack/react-query-devtools@latest

# shadcn/ui — 패키지 설치 아님, CLI로 컴포넌트 소스 복사
npx shadcn@latest init -d
```

### 라이브러리 버전

| 라이브러리 | 최신 버전 | 용도 |
|---|---|---|
| `tailwindcss` | **4.3.1** | 스타일링 (CSS 기반 설정, config 파일 없음) |
| `shadcn/ui` | latest | UI 컴포넌트 (`docs/specs/shadcn.md` 참조) |
| `lucide-react` | **1.21.0** | 아이콘 (shadcn 기본 아이콘 라이브러리) |
| `@tanstack/react-query` | **5.101.1** | 서버 상태 캐싱 (북마크 목록, 검색 결과) |
| `zustand` | **5.0.14** | 클라이언트 상태 (필터, 검색어, UI 상태) |
| `zod` | **4.4.3** | API 입력 유효성 검증 (Route Handler) |
| `@supabase/ssr` | **0.12.0** | Next.js SSR 인증 |
| `@supabase/supabase-js` | **2.108.2** | Supabase 클라이언트 |

---

## TanStack Query v5 설정

> v4 → v5 주요 변경: `cacheTime` → `gcTime`, `isLoading` → `isPending`, `keepPreviousData` → `placeholderData`, `onSuccess`/`onError` 콜백 제거.

```typescript
// app/providers.tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,   // 1분
            gcTime: 5 * 60 * 1000, // 5분 (v4 cacheTime → v5 gcTime)
            retry: 1,
          },
        },
      })
  )
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
```

```typescript
// app/layout.tsx
import { Providers } from './providers'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

### 북마크 목록 훅 예시 (A9, A62 무한 스크롤 전환)

```typescript
// hooks/useBookmarks.ts
import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query'

export interface Bookmark {
  id: string
  title: string
  url: string
  description?: string | null     // 사용자 입력 설명 (A60)
  tags: string[]
  category_id: string | null
  category?: string | null        // category_id → 이름 조인 (GET /api/bookmarks만 제공) — 카드 수정 모달 default 선택용
  is_favorite: boolean
  folder_hint: string[] | null    // 파일 임포트 시 원본 폴더 경로, 익스텐션 저장은 null
  thumbnail_url?: string | null   // og:image/YouTube 썸네일 원본 URL — 직접 렌더링 금지, /api/thumbnail 프록시 경유
  is_dead: boolean                // 저장 시점 404/410 감지 — 카드에 "링크 끊김" 배지(비차단)
  created_at: string
}

interface BookmarksFilters {
  tab?: string
  category?: string
  folder?: string[]  // 루트부터 선택 노드까지 전체 경로 — API 전달 시 '/'로 조인(동명이인 폴더 구분)
  tag?: string
}

export interface BookmarksPage {
  bookmarks: Bookmark[]
  total: number
}

const PAGE_SIZE = 20 // GET /api/bookmarks limit 기본값과 동일 — 백엔드 계약 그대로 소비

// A62: useQuery → useInfiniteQuery. GET /api/bookmarks의 page/limit/total을 소비.
export function useBookmarks(filters: BookmarksFilters) {
  return useInfiniteQuery({
    queryKey: ['bookmarks', filters],
    queryFn: async ({ pageParam }): Promise<BookmarksPage> => {
      const { folder, ...rest } = filters
      const params = new URLSearchParams(
        Object.fromEntries(Object.entries(rest).filter(([, v]) => v != null)) as Record<string, string>
      )
      if (folder && folder.length > 0) params.set('folder', folder.join('/'))
      params.set('page', String(pageParam))
      params.set('limit', String(PAGE_SIZE))
      const res = await fetch(`/api/bookmarks?${params}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.flatMap((p) => p.bookmarks).length
      return loaded < lastPage.total ? allPages.length + 1 : undefined
    },
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
  })
}
```

### 북마크 저장 뮤테이션 예시 (A5)

```typescript
// hooks/useSaveBookmark.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'

export function useSaveBookmark() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: { title: string; url: string; content: string }) => {
      const res = await fetch('/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Save failed')
      return res.json()
    },
    onSuccess: () => {
      // 목록 캐시 무효화
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] })
    },
    // v5: onError는 mutation 레벨에서만 (전역 QueryClient에서 제거됨)
  })
}
```

---

## Zustand v5 스토어

> v5 변경: `useShallow` import 경로 변경 (`zustand/react/shallow`), strict mode 동작 개선.

```typescript
// store/filterStore.ts
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow' // v5 import 경로

type SidebarTab = 'all' | 'favorites' | 'categories' | 'folders'
type SortOrder = 'latest' | 'oldest'
type ViewMode = 'list' | 'grid' | 'compact'  // compact = A50

interface FilterState {
  tab: SidebarTab
  category: string | null
  folder: string | null          // 내 폴더 탭 선택된 폴더명 (A31)
  tag: string | null
  searchQuery: string
  sortOrder: SortOrder
  viewMode: ViewMode
  setTab: (tab: SidebarTab) => void
  setCategory: (category: string | null) => void
  setFolder: (folder: string | null) => void
  setTag: (tag: string | null) => void
  setSearchQuery: (query: string) => void
  setSortOrder: (order: SortOrder) => void
  setViewMode: (mode: ViewMode) => void
  reset: () => void
}

export const useFilterStore = create<FilterState>((set) => ({
  tab: 'all',
  category: null,
  folder: null,
  tag: null,
  searchQuery: '',
  sortOrder: 'latest',
  viewMode: 'grid',
  setTab: (tab) => set({ tab }),
  setCategory: (category) => set({ category }),
  setFolder: (folder) => set({ folder }),
  setTag: (tag) => set({ tag }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSortOrder: (sortOrder) => set({ sortOrder }),
  setViewMode: (viewMode) => set({ viewMode }),
  reset: () => set({ tab: 'all', category: null, folder: null, tag: null, searchQuery: '', sortOrder: 'latest', viewMode: 'grid' }),
}))

// 여러 값 구독 시 useShallow로 불필요한 리렌더 방지
export function useFilters() {
  return useFilterStore(
    useShallow((s) => ({ category: s.category, folder: s.folder, tag: s.tag }))
  )
}
```

---

## Zod v4 스키마 (Route Handler 입력 검증)

> v4 변경: `z.string().url()` → `z.url()` 독립 메서드 추가 (체이닝도 여전히 동작), 파싱 성능 향상, `z.infer` 동일.

```typescript
// lib/schemas.ts
import { z } from 'zod'

// content는 DB insert 금지(보안 규칙) → 공개 bookmarkSchema에 미포함.
export const bookmarkSchema = z.object({
  title: z.string().min(1).max(500),
  url: z.url(),                             // v4: z.url() 독립 메서드
})

// A5 전용 transient — content는 OpenAI 처리 후 파기, DB 저장·로그 금지.
// 영속 스키마(bookmarkSchema)와 분리해 content 누출 차단.
export const bookmarkCreateSchema = bookmarkSchema.extend({
  content: z.string().max(2000).optional().default(''),
  folder_hint: z.array(z.string()).optional(),
})

export const searchSchema = z.object({
  // trim 선행(PR #251) — 공백 전용 쿼리가 createEmbedding('')로 500 나던 것을 400으로 차단
  query: z.string().trim().min(1).max(50),  // PRD: 검색창 최대 50자
  category: z.string().min(1).optional(),
  // A58: 태그·즐겨찾기 필터 — 둘 다 optional, 미지정 시 기존 전체 검색 동작 유지.
  tag: z.string().min(1).optional(),
  is_favorite: z.boolean().optional(),
})

// A60: PATCH /api/bookmarks/:id 확장 — 즐겨찾기·태그·카테고리·설명 부분 수정.
// 모든 필드 optional(부분 수정) + refine으로 빈 body(필드 0개) 400 처리.
// is_favorite 단독 요청도 그대로 통과 — 기존 즐겨찾기 토글(A27) 하위 호환.
export const bookmarkUpdateSchema = z
  .object({
    is_favorite: z.boolean().optional(),
    // PR #251: 라우트에서 normalizeTags+extractTopCategory 적용 — 대분류명 입력 시 400
    tags: z.array(z.string().min(1).max(50)).max(2).optional(),
    // 대분류 이름(또는 alias) — 실제 유효성 검증은 tag-alias.ts 기준으로 라우트에서 수행.
    // null 허용 — 미분류로 변경(카테고리 해제) 용도.
    category: z.string().min(1).max(50).nullable().optional(),
    // null 허용 — 기존 설명 삭제 용도.
    description: z.string().max(2000).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: '변경할 필드를 최소 1개 이상 전달해야 합니다.',
  })

// 임포트(A29)는 공유 스키마 없음 — multipart/form-data라 app/api/bookmarks/import/route.ts의
// 로컬 fileSchema(File 크기·타입 검증)로 처리. schemas.ts에는 두지 않음.
// 목록 조회 쿼리 파라미터 검증도 로컬 스키마 — app/api/bookmarks/route.ts의 getQuerySchema
// (tab/category/tag/folder: string optional, page: coerce int ≥1 default 1, limit: coerce int 1~100 default 20).

export type BookmarkInput = z.infer<typeof bookmarkSchema>
export type BookmarkCreateInput = z.infer<typeof bookmarkCreateSchema>
export type SearchInput = z.infer<typeof searchSchema>
export type BookmarkUpdateInput = z.infer<typeof bookmarkUpdateSchema>
```

Route Handler에서 사용:

```typescript
// app/api/bookmarks/route.ts
import { bookmarkCreateSchema } from '@/lib/schemas'

export const POST = withAuth(async (req, { user }) => {
  const body = await req.json()
  // content 포함 검증 → bookmarkCreateSchema(transient). 공개 bookmarkSchema엔 content 없음.
  const parsed = bookmarkCreateSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() }, // v4: flatten() 동일
      { status: 400 }
    )
  }

  const { title, url, content } = parsed.data
  // content 로그 마스킹 (A8)
  // ...
})
```

---

## Tailwind CSS v4

> v4 변경: `tailwind.config.js` 제거 → CSS 파일에서 직접 설정. `@tailwind` 디렉티브 제거 → `@import "tailwindcss"`.

```css
/* app/globals.css */
@import "tailwindcss";

/* 커스텀 토큰 — v4 @theme (v3 theme.extend 대체) */
@theme {
  --color-brand: #0f766e;   /* Deep Teal — design-system.md */
  --font-sans: 'Pretendard', sans-serif;
}
```

`postcss.config.mjs` (Next.js + Tailwind v4):

```js
// postcss.config.mjs
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
```

> `tailwindcss/nesting`, `autoprefixer` 별도 설치 불필요 — v4에 내장.

---

## 환경변수

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...          # 공개 가능
SUPABASE_SERVICE_ROLE_KEY=eyJ...              # 서버 전용 — NEXT_PUBLIC_ 금지
OPENAI_API_KEY=sk-...                         # 서버 전용 — NEXT_PUBLIC_ 금지
```

---

## Supabase 클라이언트 생성

### 서버 컴포넌트 / Route Handler용 (`lib/supabase/server.ts`)

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  // Next.js 16: cookies()가 async
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component에서 호출 시 무시 (읽기 전용)
          }
        },
      },
    }
  )
}
```

### Service Role 클라이언트 (`lib/supabase/admin.ts`)

```typescript
import { createClient } from '@supabase/supabase-js'

// A14 탈퇴 처리 전용 — Route Handler 서버사이드에서만 호출
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

### 클라이언트 컴포넌트용 (`lib/supabase/client.ts`)

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

---

## Proxy (`proxy.ts`, 구 middleware.ts)

Next.js 16에서 `middleware` 파일 규칙 deprecated. `front/proxy.ts`에 `export function proxy()`로 작성한다 (마이그레이션: `npx @next/codemod@canary middleware-to-proxy .`).

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/auth', '/privacy', '/terms', '/goodbye', '/welcome']

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname.startsWith(p))
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() — getSession() 대신 사용 (서버사이드 검증)
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL('/welcome', request.url))
  }

  return supabaseResponse
}

export const config = {
  // api 제외: API 라우트는 withAuth가 401 JSON. 미들웨어 302 시 fetch 클라이언트가 HTML 로그인 페이지 수신.
  // demo 제외: /welcome 랜딩의 public/demo 정적 자산이 로그인 리다이렉트에 걸리지 않도록.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|demo).*)'],
}
```

---

## withAuth HOF (A3)

```typescript
// lib/auth.ts
import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient } from './supabase/server'

// 핸들러에 { user, supabase } 주입 + 동적 라우트 params(제네릭 P) 그대로 전달.
type AuthContext<P> = { user: User; supabase: SupabaseClient } & P

export function withAuth<P = unknown>(
  handler: (req: Request, ctx: AuthContext<P>) => Promise<Response> | Response
) {
  return async (req: Request, routeCtx?: P) => {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return handler(req, { user, supabase, ...((routeCtx ?? {}) as P) })
  }
}
```

---

## Route Handler 패턴

### POST + GET 같은 파일 (`app/api/bookmarks/route.ts`)

```typescript
import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'

export const POST = withAuth(async (req, { user }) => {
  const parsed = bookmarkCreateSchema.safeParse(await req.json())
  // content 로그 절대 출력하지 않음 (A8) — 임베딩 계산 후 즉시 파기
  // ...처리 로직 (대분류 top 계산, embedding 제외 명시 컬럼 select)
  // 응답은 embedding 제외 카드 필드 + category(대분류명)를 bookmark 객체로 래핑
  return NextResponse.json({ bookmark: { ...data, category: top } }, { status: 201 })
})

export const GET = withAuth(async (req, { supabase }) => {
  // 쿼리 파라미터도 zod 검증 — getQuerySchema(tab/category/tag/folder/page/limit, coerce+default)
  const parsed = getQuerySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  )
  // ...조회 로직 (RLS 본인 데이터, embedding 제외 LIST_COLUMNS)
  return NextResponse.json({ bookmarks, total })
})
```

---

## 디렉토리 구조

```
front/
├── app/
│   ├── (dashboard)/              # 인증 필요 레이아웃 그룹
│   │   ├── page.tsx              # 북마크 목록 홈 (A9)
│   │   ├── import/
│   │   │   └── page.tsx          # 파일 임포트 WEB-14 (A30)
│   │   ├── settings/
│   │   │   └── page.tsx          # 회원 탈퇴 UI (A16) + JSON/HTML/CSV 내보내기
│   │   └── layout.tsx            # 헤더 + 사이드바
│   ├── api/
│   │   ├── bookmarks/
│   │   │   ├── route.ts          # POST(A5) + GET(A6)
│   │   │   ├── [id]/
│   │   │   │   ├── route.ts      # PATCH 부분수정(A60: is_favorite/tags/category/description) + DELETE(카드 삭제)
│   │   │   │   └── recheck/
│   │   │   │       └── route.ts  # POST — 죽은 링크 재검사(is_dead 갱신)
│   │   │   ├── import/
│   │   │   │   └── route.ts      # POST — HTML/카카오톡 CSV 파싱 + 배치 태깅 (A29)
│   │   │   ├── preview/
│   │   │   │   └── route.ts      # POST — URL 메타 미리보기 (단건 추가 검증)
│   │   │   ├── categories/
│   │   │   │   └── route.ts      # GET — 사이드바 카테고리 전용 API
│   │   │   └── folders/
│   │   │       └── route.ts      # GET — folder_hint distinct 목록 (A31)
│   │   ├── search/
│   │   │   └── route.ts          # POST(A7)
│   │   ├── thumbnail/
│   │   │   └── route.ts          # GET — 썸네일 프록시(SSRF 가드), DB/스토리지 영구 저장 없음
│   │   ├── account/
│   │   │   └── route.ts          # DELETE(A14) + GET(A15, category:categories(name) join)
│   │   ├── events/
│   │   │   └── route.ts          # POST — A68 클라이언트 이벤트 적재 (CLIENT_LOGGABLE 화이트리스트만)
│   │   └── admin/                # A67 — 내부 운영 대시보드 API (withAdmin 게이팅, 비관리자 404)
│   │       ├── stats/route.ts        # GET — OKR·카테고리·성장·트렌딩·건강 집계 + 태그 드릴다운
│   │       ├── openai-usage/route.ts # GET — OpenAI 사용량 위젯
│   │       ├── metrics/route.ts      # GET — A68 admin_metrics_weekly RPC 주간 지표
│   │       └── admins/route.ts       # GET 목록 + POST 승격(email) + DELETE 강등(본인 강등 방지)
│   ├── admin/                     # A67 — 관리자 대시보드 (성장/운영 라우트 분리)
│   │   ├── layout.tsx             # 공통 게이트(isAdmin, 비관리자 404) + AdminTabs 네비, 하위 페이지 공유
│   │   ├── page.tsx               # /admin → /admin/growth redirect
│   │   ├── growth/page.tsx        # 마케팅·그로스(OKR·성장추이·카테고리·트렌딩)
│   │   ├── ops/page.tsx           # 운영·개발(건강·OpenAI 사용량·관리자 관리)
│   │   └── northstar/page.tsx     # A68 — North Star 주간 지표 대시보드
│   ├── onboarding/                # A26 — 온보딩 별도 페이지 (MVP)
│   │   ├── page.tsx
│   │   ├── OnboardingContent.tsx  # 스텝 UI + 노출 제어
│   │   └── onboardingUtils.ts     # STEPS·상태 유틸
│   ├── welcome/page.tsx           # A39 — 랜딩 페이지 (미인증 진입점)
│   ├── login/page.tsx             # A4 — Google OAuth 버튼, A63 — 카카오 OAuth 버튼 추가
│   ├── auth/callback/route.ts     # A4 — OAuth 콜백 핸들러
│   ├── privacy/page.tsx           # A12
│   ├── terms/page.tsx             # A13
│   ├── goodbye/page.tsx
│   ├── robots.ts                  # SEO — robots 메타
│   ├── sitemap.ts                 # SEO — sitemap 생성
│   └── icon.png                   # 파비콘
├── lib/
│   ├── supabase/
│   │   ├── server.ts
│   │   ├── client.ts
│   │   └── admin.ts
│   ├── auth.ts                    # withAuth HOF (A3)
│   ├── admin-auth.ts              # withAdmin HOF (A67) — withAuth 위 is_admin() 게이팅, 비관리자 404
│   ├── admin-range.ts             # A67 — range(1d/7d/30d) 파싱 + rangeToInterval
│   ├── events.ts                  # A68 — logEvent(s) 헬퍼. 이벤트 4종, CLIENT_LOGGABLE 화이트리스트, 실패 시 UX 비차단
│   ├── schemas.ts                 # bookmarkSchema, searchSchema, bookmarkUpdateSchema(A60: is_favorite/tags/category/description)
│   ├── ai.ts                      # generateTags(태깅 프롬프트)·createEmbedding·weak-vector 보강
│   ├── openai.ts                  # OpenAI 클라이언트 (서버 전용)
│   ├── fetchMeta.ts               # 외부 URL title/description/og:image/본문 추출 (YouTube oEmbed 포함)
│   ├── normalizeUrl.ts            # canonical URL 정규화 (중복 방지 키)
│   ├── ssrf.ts                    # isSafeHttpUrl — 썸네일 등 외부 URL SSRF 가드
│   ├── logger.ts                  # maskSensitive 로거 (content 평문 금지, A8)
│   ├── tag-alias.ts               # 태그 정규화 사전 + 대분류 추출 (normalizeTags·extractTopCategory)
│   ├── search-alias.ts            # 검색 교차언어(한↔영 브랜드) alias 사전
│   ├── tag-eval.ts / search-eval.ts # eval 지표 함수 (scoreTags·aggregate·scoreQuery)
│   ├── filterQuery.ts / folderTree.ts / backfillUrlPlan.ts / onboarding.ts / site.ts / utils.ts / youtube.ts
│   ├── parseNetscapeBookmarks.ts  # HTML 임포트 파싱 (A29). 자체 내보내기분은 TAGS/DATA_CATEGORY 속성 복원
│   ├── parseKakaoChat.ts         # 카카오톡 채팅 내보내기 CSV(Date,User,Message) 파싱 — Message 내 URL만 추출, 대화 본문 미보관
│   ├── formatNetscapeBookmarks.ts # 설정 페이지 HTML 내보내기 — TAGS/DATA_CATEGORY 포함, 재임포트 시 태그·카테고리 복원
│   └── formatKakaoChatCsv.ts     # 설정 페이지 CSV 내보내기 — 카카오톡 내보내기와 동일 포맷(Date,User,Message)으로 직렬화, parseKakaoChat으로 재임포트 가능
├── store/
│   ├── filterStore.ts             # tab, category, folder, sortOrder, viewMode 등
│   └── userStore.ts               # 인증 사용자 캐시 (zustand)
└── proxy.ts                        # 구 middleware.ts (Next.js 16)
```
