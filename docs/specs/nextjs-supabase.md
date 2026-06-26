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

### 북마크 목록 훅 예시 (A9)

```typescript
// hooks/useBookmarks.ts
import { useQuery, keepPreviousData } from '@tanstack/react-query'

interface Bookmark {
  id: string
  title: string
  url: string
  tags: string[]
  category_id: string | null
  is_favorite: boolean
  folder_hint: string[] | null   // 파일 임포트 시 원본 폴더 경로, 익스텐션 저장은 null
  created_at: string
}

export function useBookmarks(filters: {
  tab?: 'all' | 'favorites' | 'categories' | 'folders'
  category?: string
  folder?: string    // 내 폴더 탭 선택 시 folder_hint[0] 값
  tag?: string
  sort?: 'created_at' | 'similarity'
}) {
  return useQuery({
    queryKey: ['bookmarks', filters],
    queryFn: async (): Promise<{ bookmarks: Bookmark[]; total: number }> => {
      const params = new URLSearchParams(
        Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null)) as Record<string, string>
      )
      const res = await fetch(`/api/bookmarks?${params}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
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
type SortOrder = 'created_at' | 'similarity'
type ViewMode = 'list' | 'grid'  // 'compact'는 v1.1

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
  sortOrder: 'created_at',
  viewMode: 'list',
  setTab: (tab) => set({ tab }),
  setCategory: (category) => set({ category }),
  setFolder: (folder) => set({ folder }),
  setTag: (tag) => set({ tag }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSortOrder: (sortOrder) => set({ sortOrder }),
  setViewMode: (viewMode) => set({ viewMode }),
  reset: () => set({ tab: 'all', category: null, folder: null, tag: null, searchQuery: '', sortOrder: 'created_at', viewMode: 'list' }),
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

export const bookmarkSchema = z.object({
  title: z.string().min(1).max(500),
  url: z.url(),                             // v4: z.url() 독립 메서드
  content: z.string().max(2000).optional().default(''),
})

export const searchSchema = z.object({
  query: z.string().min(1).max(50),         // PRD: 검색창 최대 50자
})

export const favoriteSchema = z.object({
  is_favorite: z.boolean(),                 // A27 즐겨찾기 토글
})

export const importSchema = z.object({
  // multipart/form-data — HTML 파일 업로드 (A29)
  // Route Handler에서 req.formData()로 파싱
})

export type BookmarkInput = z.infer<typeof bookmarkSchema>
export type SearchInput = z.infer<typeof searchSchema>
export type FavoriteInput = z.infer<typeof favoriteSchema>
```

Route Handler에서 사용:

```typescript
// app/api/bookmarks/route.ts
import { bookmarkSchema } from '@/lib/schemas'

export const POST = withAuth(async (req, { user }) => {
  const body = await req.json()
  const parsed = bookmarkSchema.safeParse(body)

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
  --color-brand: #6366f1;
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

## Middleware (`middleware.ts`)

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
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
  const isPublic = ['/login', '/auth', '/privacy', '/terms', '/goodbye'].some(
    p => pathname.startsWith(p)
  )

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

---

## withAuth HOF (A3)

```typescript
// lib/auth.ts
import { NextResponse } from 'next/server'
import { createClient } from './supabase/server'

type AuthedHandler = (
  req: Request,
  ctx: { user: { id: string; email?: string } }
) => Promise<Response>

export function withAuth(handler: AuthedHandler) {
  return async (req: Request) => {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return handler(req, { user })
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
  const { title, url, content } = await req.json()
  // content 로그 절대 출력하지 않음 (A8)
  // ...처리 로직
  return NextResponse.json({ id, tags, category }, { status: 201 })
})

export const GET = withAuth(async (req, { user }) => {
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const tag = searchParams.get('tag')
  const page = Number(searchParams.get('page') ?? 1)
  const limit = Number(searchParams.get('limit') ?? 20)
  // ...조회 로직
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
│   │   │   └── page.tsx          # 회원 탈퇴 UI (A16)
│   │   └── layout.tsx            # 헤더 + 사이드바
│   ├── api/
│   │   ├── bookmarks/
│   │   │   ├── route.ts          # POST(A5) + GET(A6)
│   │   │   ├── [id]/
│   │   │   │   └── route.ts      # PATCH is_favorite(A27) + DELETE(카드 삭제)
│   │   │   ├── import/
│   │   │   │   └── route.ts      # POST — HTML 파싱 + 배치 태깅 (A29)
│   │   │   └── folders/
│   │   │       └── route.ts      # GET — folder_hint distinct 목록 (A31)
│   │   ├── search/
│   │   │   └── route.ts          # POST(A7)
│   │   └── account/
│   │       └── route.ts          # DELETE(A14) + GET(A15)
│   ├── onboarding/
│   │   └── page.tsx               # A26 — 온보딩 별도 페이지 (MVP)
│   ├── login/page.tsx             # A4 — Google OAuth 버튼만
│   ├── auth/callback/route.ts     # A4 — OAuth 콜백 핸들러
│   ├── privacy/page.tsx           # A12
│   ├── terms/page.tsx             # A13
│   └── goodbye/page.tsx
├── components/
│   └── onboarding/               # v1.1 Modal Wizard (onboarding-modal.md 참조)
│       ├── OnboardingModal.tsx    # 노출 제어 + 스텝 상태
│       ├── OnboardingStep.tsx     # 개별 스텝 콘텐츠
│       └── steps.ts               # STEPS 배열 정의
├── lib/
│   ├── supabase/
│   │   ├── server.ts
│   │   ├── client.ts
│   │   └── admin.ts
│   ├── auth.ts                    # withAuth HOF (A3)
│   └── schemas.ts                 # bookmarkSchema, searchSchema, favoriteSchema
├── store/
│   └── filterStore.ts             # tab, category, folder, sortOrder, viewMode 등
└── middleware.ts
```
