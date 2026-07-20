# /admin 내부 대시보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 전용 `/admin` 대시보드를 만들어 OKR 실측·OpenAI 사용량·카테고리/태그 분포를 한 화면에서 본다.

**Architecture:** 전체 사용자 집계는 RLS를 우회하므로 `SUPABASE_SERVICE_ROLE_KEY`(`createAdminClient`)로 호출하는 **Postgres 집계 함수**(SECURITY DEFINER)를 통해 **집계값만** 반환한다. `withAdmin` allowlist HOF로 게이팅하고, 프론트는 range 탭(1d/7d/30d)과 `?category=` 쿼리 동기화 모달로 드릴다운한다. OpenAI 사용량은 서버 프록시가 OpenAI Organization Usage/Costs API를 호출한다.

**Tech Stack:** Next.js 16 App Router, Supabase(Postgres/pgvector), Zod v4, Vitest, @testing-library/react, recharts(신규).

**설계 출처:** `docs/superpowers/specs/2026-07-20-admin-dashboard-design.md`

---

## File Structure

| 파일 | 책임 |
|---|---|
| `front/lib/admin-auth.ts` | `isAdmin`, `withAdmin` — allowlist 게이팅 HOF |
| `front/lib/admin-range.ts` | range(1d/7d/30d) ↔ interval/days 매핑·검증 |
| `supabase/migrations/0026_admin_stats_functions.sql` | `admin_okr_stats`·`admin_category_stats`·`admin_tag_stats` |
| `front/app/api/admin/stats/route.ts` | OKR·카테고리·태그 집계 API |
| `front/app/api/admin/openai-usage/route.ts` | OpenAI Usage API 서버 프록시 |
| `front/components/admin/DonutChart.tsx` | recharts 도넛 공용 컴포넌트 |
| `front/components/admin/OkrTiles.tsx` | OKR 실측 타일 |
| `front/components/admin/OpenAiUsage.tsx` | OpenAI 사용량 위젯 |
| `front/components/admin/CategoryPie.tsx` | 카테고리 도넛 + 슬라이스 클릭 |
| `front/components/admin/CategoryDrilldownModal.tsx` | `?category=` 동기화 모달 (하위 태그 도넛) |
| `front/components/admin/AdminDashboard.tsx` | 클라이언트 셸 — range 상태·데이터 페치·조립 |
| `front/app/admin/page.tsx` | 서버 게이트(`isAdmin`→`notFound`) + 셸 렌더 |
| `front/e2e/admin.md` | E2E 저니 시나리오 |

---

## Task 1: `withAdmin` 게이팅 HOF

**Files:**
- Create: `front/lib/admin-auth.ts`
- Test: `front/lib/__tests__/admin-auth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// front/lib/__tests__/admin-auth.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

let currentUser: unknown = { id: 'admin-1' }
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser }, error: null }) },
  }),
}))

import { isAdmin, withAdmin } from '../admin-auth'

function req() {
  return new Request('http://t/api/admin/stats')
}

describe('isAdmin', () => {
  beforeEach(() => {
    process.env.ADMIN_USER_IDS = 'admin-1, admin-2'
  })

  it('allowlist에 있으면 true', () => {
    expect(isAdmin('admin-1')).toBe(true)
    expect(isAdmin('admin-2')).toBe(true)
  })

  it('allowlist에 없으면 false', () => {
    expect(isAdmin('stranger')).toBe(false)
  })

  it('환경변수 미설정 시 아무도 admin 아님', () => {
    delete process.env.ADMIN_USER_IDS
    expect(isAdmin('admin-1')).toBe(false)
  })
})

describe('withAdmin', () => {
  beforeEach(() => {
    process.env.ADMIN_USER_IDS = 'admin-1'
    currentUser = { id: 'admin-1' }
  })

  it('관리자는 핸들러 통과', async () => {
    const handler = withAdmin(async () => Response.json({ ok: true }))
    const res = await handler(req())
    expect(res.status).toBe(200)
  })

  it('비관리자는 404 (존재 은닉)', async () => {
    currentUser = { id: 'stranger' }
    const handler = withAdmin(async () => Response.json({ ok: true }))
    const res = await handler(req())
    expect(res.status).toBe(404)
  })

  it('미인증은 401 (withAuth 위임)', async () => {
    currentUser = null
    const handler = withAdmin(async () => Response.json({ ok: true }))
    const res = await handler(req())
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd front && npx vitest run lib/__tests__/admin-auth.test.ts`
Expected: FAIL — `Cannot find module '../admin-auth'`

- [ ] **Step 3: Write minimal implementation**

```ts
// front/lib/admin-auth.ts
import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { withAuth } from './auth'

// ADMIN_USER_IDS: 쉼표 구분 allowlist (서버 전용, NEXT_PUBLIC_ 금지)
function adminIds(): Set<string> {
  return new Set(
    (process.env.ADMIN_USER_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )
}

export function isAdmin(userId: string): boolean {
  return adminIds().has(userId)
}

type AdminContext<P> = { user: User; supabase: SupabaseClient } & P

// withAuth(401) 위에 얹어 비관리자는 404로 은닉.
export function withAdmin<P = unknown>(
  handler: (req: Request, ctx: AdminContext<P>) => Promise<Response> | Response
) {
  return withAuth<P>(async (req, ctx) => {
    if (!isAdmin(ctx.user.id)) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 })
    }
    return handler(req, ctx)
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd front && npx vitest run lib/__tests__/admin-auth.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add front/lib/admin-auth.ts front/lib/__tests__/admin-auth.test.ts
git commit -m "feat(admin): allowlist 게이팅 withAdmin HOF 추가"
```

---

## Task 2: range 매핑 유틸

**Files:**
- Create: `front/lib/admin-range.ts`
- Test: `front/lib/__tests__/admin-range.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// front/lib/__tests__/admin-range.test.ts
import { describe, it, expect } from 'vitest'
import { parseRange, rangeToInterval, RANGE_DAYS, ADMIN_RANGES } from '../admin-range'

describe('admin-range', () => {
  it('유효한 range는 그대로', () => {
    expect(parseRange('1d')).toBe('1d')
    expect(parseRange('30d')).toBe('30d')
  })

  it('무효/누락은 7d 기본', () => {
    expect(parseRange(null)).toBe('7d')
    expect(parseRange('999d')).toBe('7d')
  })

  it('interval 문자열 매핑', () => {
    expect(rangeToInterval('1d')).toBe('1 day')
    expect(rangeToInterval('7d')).toBe('7 days')
    expect(rangeToInterval('30d')).toBe('30 days')
  })

  it('일수 매핑', () => {
    expect(RANGE_DAYS['30d']).toBe(30)
  })

  it('탭 목록은 3종', () => {
    expect(ADMIN_RANGES).toEqual(['1d', '7d', '30d'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd front && npx vitest run lib/__tests__/admin-range.test.ts`
Expected: FAIL — `Cannot find module '../admin-range'`

- [ ] **Step 3: Write minimal implementation**

```ts
// front/lib/admin-range.ts
export const ADMIN_RANGES = ['1d', '7d', '30d'] as const
export type AdminRange = (typeof ADMIN_RANGES)[number]

const INTERVALS: Record<AdminRange, string> = {
  '1d': '1 day',
  '7d': '7 days',
  '30d': '30 days',
}

export const RANGE_DAYS: Record<AdminRange, number> = {
  '1d': 1,
  '7d': 7,
  '30d': 30,
}

export function isAdminRange(v: string): v is AdminRange {
  return (ADMIN_RANGES as readonly string[]).includes(v)
}

export function parseRange(v: string | null): AdminRange {
  return v && isAdminRange(v) ? v : '7d'
}

export function rangeToInterval(r: AdminRange): string {
  return INTERVALS[r]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd front && npx vitest run lib/__tests__/admin-range.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add front/lib/admin-range.ts front/lib/__tests__/admin-range.test.ts
git commit -m "feat(admin): range(1d/7d/30d) 매핑 유틸 추가"
```

---

## Task 3: DB 집계 함수 마이그레이션

**Files:**
- Create: `supabase/migrations/0026_admin_stats_functions.sql`

> 집계는 SQL에서 끝내 **개별 행을 앱으로 끌어오지 않는다.** `SECURITY DEFINER` + `set search_path = public`. service_role(`createAdminClient`)로만 호출.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0026_admin_stats_functions.sql
-- /admin 대시보드 전체 사용자 집계 함수. service_role 전용 호출.
-- 반환은 집계값만 — embedding/content/user_id 미노출.

-- OKR 실측 타일
create or replace function admin_okr_stats(p_interval text)
returns table(
  active_users bigint,
  first_save_rate numeric,
  saves_per_user numeric,
  new_saves bigint
)
language sql
security definer
set search_path = public
as $$
  with since as (select now() - p_interval::interval as t),
  saves as (
    select b.user_id, count(*) as c
    from bookmarks b, since
    where b.created_at >= since.t
    group by b.user_id
  ),
  signups as (
    select u.id from auth.users u, since where u.created_at >= since.t
  )
  select
    (select count(*) from saves)::bigint as active_users,
    coalesce(
      (select count(*) from signups s
         where exists (select 1 from bookmarks b where b.user_id = s.id))::numeric
      / nullif((select count(*) from signups), 0),
      0
    ) as first_save_rate,
    coalesce(
      (select sum(c) from saves)::numeric / nullif((select count(*) from saves), 0),
      0
    ) as saves_per_user,
    coalesce((select sum(c) from saves), 0)::bigint as new_saves;
$$;

-- 카테고리 분포 (유저별 categories 테이블 → name 기준 집계, null → 미분류)
create or replace function admin_category_stats(p_interval text)
returns table(name text, count bigint)
language sql
security definer
set search_path = public
as $$
  select coalesce(c.name, '미분류') as name, count(*)::bigint as count
  from bookmarks b
  left join categories c on b.category_id = c.id
  where b.created_at >= now() - p_interval::interval
  group by coalesce(c.name, '미분류')
  order by count(*) desc;
$$;

-- 특정 카테고리의 하위 태그 분포 (tags 배열 unnest)
create or replace function admin_tag_stats(p_category text, p_interval text)
returns table(tag text, count bigint)
language sql
security definer
set search_path = public
as $$
  select t as tag, count(*)::bigint as count
  from bookmarks b
  left join categories c on b.category_id = c.id
  cross join lateral unnest(b.tags) as t
  where b.created_at >= now() - p_interval::interval
    and coalesce(c.name, '미분류') = p_category
  group by t
  order by count(*) desc;
$$;

grant execute on function admin_okr_stats(text) to service_role;
grant execute on function admin_category_stats(text) to service_role;
grant execute on function admin_tag_stats(text, text) to service_role;

-- 익명/인증 롤에는 실행권 부여 안 함 (전체 사용자 집계 노출 방지)
revoke execute on function admin_okr_stats(text) from anon, authenticated;
revoke execute on function admin_category_stats(text) from anon, authenticated;
revoke execute on function admin_tag_stats(text, text) from anon, authenticated;
```

- [ ] **Step 2: 마이그레이션 적용**

Run: `supabase db push` (또는 프로젝트의 마이그레이션 적용 명령)
Expected: `0026_admin_stats_functions.sql` applied, no error

- [ ] **Step 3: 수동 검증 쿼리 (Supabase SQL Editor)**

```sql
select * from admin_category_stats('30 days');
select * from admin_okr_stats('7 days');
```
Expected: 카테고리별 count 행 반환 / OKR 단일 행 반환. 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0026_admin_stats_functions.sql
git commit -m "feat(admin): 전체 사용자 집계 SQL 함수 3종 추가"
```

---

## Task 4: `GET /api/admin/stats`

**Files:**
- Create: `front/app/api/admin/stats/route.ts`
- Test: `front/app/api/admin/__tests__/stats.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// front/app/api/admin/__tests__/stats.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

let currentUser: unknown = { id: 'admin-1' }
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser }, error: null }) },
  }),
}))

const rpc = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc }),
}))

import { GET } from '../stats/route'

function req(qs = '') {
  return new Request(`http://t/api/admin/stats${qs}`)
}

describe('GET /api/admin/stats', () => {
  beforeEach(() => {
    process.env.ADMIN_USER_IDS = 'admin-1'
    currentUser = { id: 'admin-1' }
    rpc.mockReset()
  })

  it('비관리자는 404', async () => {
    currentUser = { id: 'stranger' }
    const res = await GET(req())
    expect(res.status).toBe(404)
  })

  it('OKR + 카테고리 % 집계 반환', async () => {
    rpc.mockImplementation((fn: string) => {
      if (fn === 'admin_okr_stats')
        return Promise.resolve({
          data: [{ active_users: 10, first_save_rate: 0.6, saves_per_user: 3, new_saves: 30 }],
          error: null,
        })
      if (fn === 'admin_category_stats')
        return Promise.resolve({
          data: [
            { name: '개발', count: 30 },
            { name: '미분류', count: 10 },
          ],
          error: null,
        })
      return Promise.resolve({ data: [], error: null })
    })

    const res = await GET(req('?range=7d'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.range).toBe('7d')
    expect(body.okr.activeUsers).toBe(10)
    expect(body.categories[0]).toEqual({ name: '개발', count: 30, pct: 0.75 })
    // 금지 컬럼 부재
    expect(JSON.stringify(body)).not.toContain('embedding')
    expect(JSON.stringify(body)).not.toContain('user_id')
  })

  it('category 지정 시 태그 드릴다운 반환', async () => {
    rpc.mockResolvedValue({
      data: [
        { tag: 'React', count: 6 },
        { tag: 'Next.js', count: 4 },
      ],
      error: null,
    })

    const res = await GET(req('?range=7d&category=개발'))
    const body = await res.json()

    expect(rpc).toHaveBeenCalledWith('admin_tag_stats', { p_category: '개발', p_interval: '7 days' })
    expect(body.category).toBe('개발')
    expect(body.tags[0]).toEqual({ tag: 'React', count: 6, pct: 0.6 })
  })

  it('RPC 에러 시 500', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await GET(req('?range=7d'))
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd front && npx vitest run app/api/admin/__tests__/stats.test.ts`
Expected: FAIL — `Cannot find module '../stats/route'`

- [ ] **Step 3: Write minimal implementation**

```ts
// front/app/api/admin/stats/route.ts
import { withAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseRange, rangeToInterval } from '@/lib/admin-range'

type CountRow = { name?: string; tag?: string; count: number | string }

function withPct<T extends { count: number }>(
  rows: Array<{ count: number | string } & Record<string, unknown>>,
  key: 'name' | 'tag'
) {
  const norm = rows.map((r) => ({ ...r, count: Number(r.count) }))
  const total = norm.reduce((s, r) => s + r.count, 0)
  return norm.map((r) => ({
    [key]: r[key] as string,
    count: r.count,
    pct: total ? r.count / total : 0,
  }))
}

export const GET = withAdmin(async (req) => {
  const url = new URL(req.url)
  const range = parseRange(url.searchParams.get('range'))
  const interval = rangeToInterval(range)
  const category = url.searchParams.get('category')
  const admin = createAdminClient()

  // 드릴다운: 카테고리 → 하위 태그
  if (category) {
    const { data, error } = await admin.rpc('admin_tag_stats', {
      p_category: category,
      p_interval: interval,
    })
    if (error) return Response.json({ error: error.message }, { status: 500 })
    const tags = withPct((data ?? []) as CountRow[], 'tag')
    return Response.json({ range, category, tags })
  }

  // 기본: OKR + 카테고리 분포
  const [okrRes, catRes] = await Promise.all([
    admin.rpc('admin_okr_stats', { p_interval: interval }),
    admin.rpc('admin_category_stats', { p_interval: interval }),
  ])
  if (okrRes.error) return Response.json({ error: okrRes.error.message }, { status: 500 })
  if (catRes.error) return Response.json({ error: catRes.error.message }, { status: 500 })

  const o = okrRes.data?.[0] ?? {
    active_users: 0,
    first_save_rate: 0,
    saves_per_user: 0,
    new_saves: 0,
  }
  const categories = withPct((catRes.data ?? []) as CountRow[], 'name')

  return Response.json({
    range,
    okr: {
      activeUsers: Number(o.active_users),
      firstSaveRate: Number(o.first_save_rate),
      savesPerUser: Number(o.saves_per_user),
      newSaves: Number(o.new_saves),
    },
    categories,
  })
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd front && npx vitest run app/api/admin/__tests__/stats.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add front/app/api/admin/stats/route.ts front/app/api/admin/__tests__/stats.test.ts
git commit -m "feat(admin): GET /api/admin/stats 집계 API 추가"
```

---

## Task 5: `GET /api/admin/openai-usage`

**Files:**
- Create: `front/app/api/admin/openai-usage/route.ts`
- Test: `front/app/api/admin/__tests__/openai-usage.test.ts`

> OpenAI Organization Costs/Usage API 필드 경로는 버전에 따라 다를 수 있다. 구현 시 Context7/OpenAI 문서로 확인하고, **파싱 실패·키 미설정·비200 응답은 모두 `available:false`로 무음 실패 없이 표기**한다. `estCostPerUser`는 활성 사용자 수를 모르는 이 라우트가 아니라 컴포넌트에서 계산한다.

- [ ] **Step 1: Write the failing test**

```ts
// front/app/api/admin/__tests__/openai-usage.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let currentUser: unknown = { id: 'admin-1' }
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser }, error: null }) },
  }),
}))

import { GET } from '../openai-usage/route'

function req(qs = '') {
  return new Request(`http://t/api/admin/openai-usage${qs}`)
}

describe('GET /api/admin/openai-usage', () => {
  beforeEach(() => {
    process.env.ADMIN_USER_IDS = 'admin-1'
    currentUser = { id: 'admin-1' }
  })
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.OPENAI_ADMIN_KEY
  })

  it('비관리자는 404', async () => {
    currentUser = { id: 'stranger' }
    const res = await GET(req())
    expect(res.status).toBe(404)
  })

  it('키 미설정 시 available:false', async () => {
    const res = await GET(req('?range=30d'))
    const body = await res.json()
    expect(body.available).toBe(false)
    expect(body.totalCostUsd).toBe(0)
  })

  it('Costs API 200 → 비용 합산', async () => {
    process.env.OPENAI_ADMIN_KEY = 'sk-admin-test'
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { results: [{ amount: { value: 0.5 } }] },
            { results: [{ amount: { value: 1.25 } }] },
          ],
        }),
        { status: 200 }
      )
    )
    const res = await GET(req('?range=30d'))
    const body = await res.json()
    expect(body.available).toBe(true)
    expect(body.totalCostUsd).toBeCloseTo(1.75)
  })

  it('비200 응답 시 available:false', async () => {
    process.env.OPENAI_ADMIN_KEY = 'sk-admin-test'
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('nope', { status: 401 }))
    const res = await GET(req('?range=30d'))
    const body = await res.json()
    expect(body.available).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd front && npx vitest run app/api/admin/__tests__/openai-usage.test.ts`
Expected: FAIL — `Cannot find module '../openai-usage/route'`

- [ ] **Step 3: Write minimal implementation**

```ts
// front/app/api/admin/openai-usage/route.ts
import { withAdmin } from '@/lib/admin-auth'
import { parseRange, RANGE_DAYS } from '@/lib/admin-range'

type UsageResponse = {
  range: string
  available: boolean
  totalCostUsd: number
  totalTokens: number
  byModel: Array<{ model: string; costUsd: number }>
}

function unavailable(range: string): UsageResponse {
  return { range, available: false, totalCostUsd: 0, totalTokens: 0, byModel: [] }
}

export const GET = withAdmin(async (req) => {
  const range = parseRange(new URL(req.url).searchParams.get('range'))
  const key = process.env.OPENAI_ADMIN_KEY
  if (!key) return Response.json(unavailable(range))

  const startTime = Math.floor(Date.now() / 1000) - RANGE_DAYS[range] * 86400

  try {
    const res = await fetch(
      `https://api.openai.com/v1/organization/costs?start_time=${startTime}&limit=180`,
      {
        headers: { Authorization: `Bearer ${key}` },
        // 사용량 API는 지연·rate limit 있음 → 15분 캐시
        next: { revalidate: 900 },
      }
    )
    if (!res.ok) return Response.json(unavailable(range))

    const json = (await res.json()) as {
      data?: Array<{ results?: Array<{ amount?: { value?: number } }> }>
    }
    const totalCostUsd = (json.data ?? [])
      .flatMap((b) => b.results ?? [])
      .reduce((s, r) => s + (r.amount?.value ?? 0), 0)

    return Response.json({
      range,
      available: true,
      totalCostUsd,
      totalTokens: 0, // 토큰 상세는 usage/completions 엔드포인트로 확장 (Phase 2)
      byModel: [],
    } satisfies UsageResponse)
  } catch {
    return Response.json(unavailable(range))
  }
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd front && npx vitest run app/api/admin/__tests__/openai-usage.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add front/app/api/admin/openai-usage/route.ts front/app/api/admin/__tests__/openai-usage.test.ts
git commit -m "feat(admin): OpenAI 사용량 서버 프록시 API 추가"
```

---

## Task 6: recharts 설치 + `DonutChart` 공용 컴포넌트

**Files:**
- Modify: `front/package.json` (recharts 추가)
- Create: `front/components/admin/DonutChart.tsx`
- Test: `front/components/admin/__tests__/DonutChart.test.tsx`

- [ ] **Step 1: recharts 설치**

Run: `cd front && npm install recharts`
Expected: `package.json` dependencies에 `recharts` 추가

- [ ] **Step 2: Write the failing test**

```tsx
// front/components/admin/__tests__/DonutChart.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { DonutChart } from '../DonutChart'

afterEach(cleanup)

describe('DonutChart', () => {
  it('빈 데이터는 안내 문구 표시', () => {
    render(<DonutChart data={[]} />)
    expect(screen.getByText('데이터 없음')).toBeInTheDocument()
  })

  it('범례에 라벨과 % 표시', () => {
    render(
      <DonutChart
        data={[
          { label: '개발', value: 30, pct: 0.75 },
          { label: '미분류', value: 10, pct: 0.25 },
        ]}
      />
    )
    expect(screen.getByText('개발')).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd front && npx vitest run components/admin/__tests__/DonutChart.test.tsx`
Expected: FAIL — `Cannot find module '../DonutChart'`

- [ ] **Step 4: Write minimal implementation**

```tsx
// front/components/admin/DonutChart.tsx
'use client'

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

export type DonutDatum = { label: string; value: number; pct: number }

// 내부 도구용 정적 팔레트 (색은 의미가 아니라 구분용)
const COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4',
  '#a855f7', '#ec4899', '#84cc16', '#14b8a6', '#f97316',
]

export function DonutChart({
  data,
  onSliceClick,
}: {
  data: DonutDatum[]
  onSliceClick?: (label: string) => void
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">데이터 없음</p>
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="h-56 w-full sm:w-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="55%"
              outerRadius="85%"
              paddingAngle={2}
              onClick={(d: unknown) => {
                const label = (d as { label?: string })?.label
                if (label && onSliceClick) onSliceClick(label)
              }}
            >
              {data.map((d, i) => (
                <Cell
                  key={d.label}
                  fill={COLORS[i % COLORS.length]}
                  cursor={onSliceClick ? 'pointer' : 'default'}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 space-y-1 text-sm">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              {onSliceClick ? (
                <button
                  type="button"
                  className="hover:underline"
                  onClick={() => onSliceClick(d.label)}
                >
                  {d.label}
                </button>
              ) : (
                <span>{d.label}</span>
              )}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {Math.round(d.pct * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd front && npx vitest run components/admin/__tests__/DonutChart.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add front/package.json front/package-lock.json front/components/admin/DonutChart.tsx front/components/admin/__tests__/DonutChart.test.tsx
git commit -m "feat(admin): recharts 도넛 공용 컴포넌트 추가"
```

---

## Task 7: `OkrTiles` + `OpenAiUsage` 표시 컴포넌트

**Files:**
- Create: `front/components/admin/OkrTiles.tsx`
- Create: `front/components/admin/OpenAiUsage.tsx`
- Test: `front/components/admin/__tests__/OkrTiles.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// front/components/admin/__tests__/OkrTiles.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { OkrTiles } from '../OkrTiles'
import { OpenAiUsage } from '../OpenAiUsage'

afterEach(cleanup)

describe('OkrTiles', () => {
  it('OKR 지표 값 렌더', () => {
    render(
      <OkrTiles okr={{ activeUsers: 12, firstSaveRate: 0.6, savesPerUser: 3.4, newSaves: 40 }} />
    )
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('60%')).toBeInTheDocument() // firstSaveRate
    expect(screen.getByText('활성 사용자')).toBeInTheDocument()
  })
})

describe('OpenAiUsage', () => {
  it('available=false면 조회 불가 표기 (무음 실패 금지)', () => {
    render(
      <OpenAiUsage
        usage={{ available: false, totalCostUsd: 0, totalTokens: 0, byModel: [] }}
        activeUsers={10}
      />
    )
    expect(screen.getByText('사용량 조회 불가')).toBeInTheDocument()
  })

  it('유저당 비용 = 총비용/활성사용자, $0.02 가정선 표시', () => {
    render(
      <OpenAiUsage
        usage={{ available: true, totalCostUsd: 2, totalTokens: 0, byModel: [] }}
        activeUsers={10}
      />
    )
    expect(screen.getByText('$0.2000')).toBeInTheDocument() // 2 / 10
    expect(screen.getByText(/가정선 \$0\.02/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd front && npx vitest run components/admin/__tests__/OkrTiles.test.tsx`
Expected: FAIL — `Cannot find module '../OkrTiles'`

- [ ] **Step 3: Write minimal implementation**

```tsx
// front/components/admin/OkrTiles.tsx
export type Okr = {
  activeUsers: number
  firstSaveRate: number
  savesPerUser: number
  newSaves: number
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

export function OkrTiles({ okr }: { okr: Okr }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile label="활성 사용자" value={String(okr.activeUsers)} hint="저장 기준 대리지표" />
      <Tile label="첫 저장 완료율" value={`${Math.round(okr.firstSaveRate * 100)}%`} hint="목표 70%" />
      <Tile label="1인당 저장" value={okr.savesPerUser.toFixed(1)} hint="목표 20건/월" />
      <Tile label="신규 저장" value={String(okr.newSaves)} />
    </div>
  )
}
```

```tsx
// front/components/admin/OpenAiUsage.tsx
export type Usage = {
  available: boolean
  totalCostUsd: number
  totalTokens: number
  byModel: Array<{ model: string; costUsd: number }>
}

const ASSUMED_COST_PER_USER = 0.02 // business-viability.md §2.1 가정선

export function OpenAiUsage({ usage, activeUsers }: { usage: Usage; activeUsers: number }) {
  if (!usage.available) {
    return (
      <div className="rounded-lg border p-4">
        <div className="text-sm text-muted-foreground">OpenAI 사용량</div>
        <div className="mt-1 text-sm">사용량 조회 불가</div>
        <div className="mt-1 text-xs text-muted-foreground">
          OPENAI_ADMIN_KEY 미설정 또는 API 응답 오류
        </div>
      </div>
    )
  }

  const perUser = activeUsers > 0 ? usage.totalCostUsd / activeUsers : 0

  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-muted-foreground">OpenAI 사용량</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        ${usage.totalCostUsd.toFixed(2)}
      </div>
      <div className="mt-2 text-sm tabular-nums">
        유저당 ${perUser.toFixed(4)}
        <span className="ml-2 text-xs text-muted-foreground">
          (가정선 $0.02{perUser > ASSUMED_COST_PER_USER ? ' 초과' : ' 이내'})
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd front && npx vitest run components/admin/__tests__/OkrTiles.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add front/components/admin/OkrTiles.tsx front/components/admin/OpenAiUsage.tsx front/components/admin/__tests__/OkrTiles.test.tsx
git commit -m "feat(admin): OKR 타일·OpenAI 사용량 표시 컴포넌트 추가"
```

---

## Task 8: `CategoryPie` + `CategoryDrilldownModal` (URL 동기화)

**Files:**
- Create: `front/components/admin/CategoryPie.tsx`
- Create: `front/components/admin/CategoryDrilldownModal.tsx`
- Test: `front/components/admin/__tests__/CategoryDrilldownModal.test.tsx`

> 모달은 `?category=` 쿼리로 상태를 URL에 둔다. 슬라이스 클릭 → `router.push('?category=…&range=…')`, 닫기 → 파라미터 제거. 새로고침/공유 시 복원.

- [ ] **Step 1: Write the failing test**

```tsx
// front/components/admin/__tests__/CategoryDrilldownModal.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const push = vi.fn()
let params = new URLSearchParams('')
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => params,
  usePathname: () => '/admin',
}))

import { CategoryDrilldownModal } from '../CategoryDrilldownModal'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
beforeEach(() => {
  push.mockReset()
})

describe('CategoryDrilldownModal', () => {
  it('category 파라미터 없으면 렌더 안 함', () => {
    params = new URLSearchParams('')
    const { container } = render(<CategoryDrilldownModal range="7d" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('category 있으면 태그 데이터 페치 후 도넛 표시', async () => {
    params = new URLSearchParams('category=개발&range=7d')
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          range: '7d',
          category: '개발',
          tags: [{ tag: 'React', count: 6, pct: 0.6 }, { tag: 'Next.js', count: 4, pct: 0.4 }],
        }),
        { status: 200 }
      )
    )

    render(<CategoryDrilldownModal range="7d" />)

    await waitFor(() => expect(screen.getByText('개발')).toBeInTheDocument())
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/stats?range=7d&category=%EA%B0%9C%EB%B0%9C')
    expect(screen.getByText('React')).toBeInTheDocument()
  })

  it('닫기 클릭 시 category 파라미터 제거 push', async () => {
    params = new URLSearchParams('category=개발&range=7d')
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ tags: [] }), { status: 200 })
    )
    render(<CategoryDrilldownModal range="7d" />)
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(await screen.findByLabelText('닫기'))
    expect(push).toHaveBeenCalledWith('/admin?range=7d')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd front && npx vitest run components/admin/__tests__/CategoryDrilldownModal.test.tsx`
Expected: FAIL — `Cannot find module '../CategoryDrilldownModal'`

- [ ] **Step 3: Write minimal implementation**

```tsx
// front/components/admin/CategoryPie.tsx
'use client'

import { DonutChart, type DonutDatum } from './DonutChart'

export type CategoryStat = { name: string; count: number; pct: number }

export function CategoryPie({
  categories,
  onSelect,
}: {
  categories: CategoryStat[]
  onSelect: (name: string) => void
}) {
  const data: DonutDatum[] = categories.map((c) => ({
    label: c.name,
    value: c.count,
    pct: c.pct,
  }))
  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-3 text-sm font-medium">카테고리 분포</h2>
      <DonutChart data={data} onSliceClick={onSelect} />
    </section>
  )
}
```

```tsx
// front/components/admin/CategoryDrilldownModal.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { DonutChart, type DonutDatum } from './DonutChart'
import type { AdminRange } from '@/lib/admin-range'

type TagStat = { tag: string; count: number; pct: number }

export function CategoryDrilldownModal({ range }: { range: AdminRange }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const category = params.get('category')

  const [tags, setTags] = useState<TagStat[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!category) return
    let alive = true
    setLoading(true)
    fetch(`/api/admin/stats?range=${range}&category=${encodeURIComponent(category)}`)
      .then((r) => r.json())
      .then((body) => {
        if (alive) setTags(body.tags ?? [])
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [category, range])

  if (!category) return null

  const close = () => router.push(`${pathname}?range=${range}`)
  const data: DonutDatum[] = tags.map((t) => ({ label: t.tag, value: t.count, pct: t.pct }))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={close}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">{category} · 하위 태그</h3>
          <button type="button" aria-label="닫기" onClick={close} className="text-muted-foreground">
            ✕
          </button>
        </div>
        {loading ? <p className="text-sm text-muted-foreground">불러오는 중…</p> : <DonutChart data={data} />}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd front && npx vitest run components/admin/__tests__/CategoryDrilldownModal.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add front/components/admin/CategoryPie.tsx front/components/admin/CategoryDrilldownModal.tsx front/components/admin/__tests__/CategoryDrilldownModal.test.tsx
git commit -m "feat(admin): 카테고리 도넛 + URL 동기화 드릴다운 모달 추가"
```

---

## Task 9: `AdminDashboard` 클라이언트 + `/admin/page.tsx` 서버 게이트

**Files:**
- Create: `front/components/admin/AdminDashboard.tsx`
- Create: `front/app/admin/page.tsx`
- Test: `front/components/admin/__tests__/AdminDashboard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// front/components/admin/__tests__/AdminDashboard.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const push = vi.fn()
let params = new URLSearchParams('range=7d')
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => params,
  usePathname: () => '/admin',
}))

import { AdminDashboard } from '../AdminDashboard'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
beforeEach(() => {
  push.mockReset()
  params = new URLSearchParams('range=7d')
})

function mockFetch() {
  vi.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/admin/openai-usage')) {
      return Promise.resolve(
        new Response(JSON.stringify({ available: true, totalCostUsd: 2, totalTokens: 0, byModel: [] }), { status: 200 })
      )
    }
    return Promise.resolve(
      new Response(
        JSON.stringify({
          range: '7d',
          okr: { activeUsers: 10, firstSaveRate: 0.6, savesPerUser: 3, newSaves: 30 },
          categories: [{ name: '개발', count: 30, pct: 0.75 }, { name: '미분류', count: 10, pct: 0.25 }],
        }),
        { status: 200 }
      )
    )
  })
}

describe('AdminDashboard', () => {
  it('초기 로드 시 OKR·카테고리·사용량 렌더', async () => {
    mockFetch()
    render(<AdminDashboard />)
    await waitFor(() => expect(screen.getByText('활성 사용자')).toBeInTheDocument())
    expect(screen.getByText('개발')).toBeInTheDocument()
    expect(screen.getByText('$2.00')).toBeInTheDocument()
  })

  it('range 탭 클릭 시 ?range= push', async () => {
    mockFetch()
    render(<AdminDashboard />)
    await waitFor(() => expect(screen.getByText('활성 사용자')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '30d' }))
    expect(push).toHaveBeenCalledWith('/admin?range=30d')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd front && npx vitest run components/admin/__tests__/AdminDashboard.test.tsx`
Expected: FAIL — `Cannot find module '../AdminDashboard'`

- [ ] **Step 3: Write minimal implementation**

```tsx
// front/components/admin/AdminDashboard.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { ADMIN_RANGES, parseRange, type AdminRange } from '@/lib/admin-range'
import { OkrTiles, type Okr } from './OkrTiles'
import { OpenAiUsage, type Usage } from './OpenAiUsage'
import { CategoryPie, type CategoryStat } from './CategoryPie'
import { CategoryDrilldownModal } from './CategoryDrilldownModal'

type Stats = { okr: Okr; categories: CategoryStat[] }

export function AdminDashboard() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const range = parseRange(params.get('range'))

  const [stats, setStats] = useState<Stats | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      fetch(`/api/admin/stats?range=${range}`).then((r) => r.json()),
      fetch(`/api/admin/openai-usage?range=${range}`).then((r) => r.json()),
    ]).then(([s, u]) => {
      if (!alive) return
      setStats({ okr: s.okr, categories: s.categories })
      setUsage(u)
    })
    return () => {
      alive = false
    }
  }, [range])

  const setRange = (r: AdminRange) => router.push(`${pathname}?range=${r}`)
  const selectCategory = (name: string) =>
    router.push(`${pathname}?range=${range}&category=${encodeURIComponent(name)}`)

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Admin Dashboard</h1>
        <div className="flex gap-1 rounded-lg border p-1">
          {ADMIN_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded px-3 py-1 text-sm ${r === range ? 'bg-foreground text-background' : ''}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {stats ? <OkrTiles okr={stats.okr} /> : <p className="text-sm text-muted-foreground">불러오는 중…</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {usage && <OpenAiUsage usage={usage} activeUsers={stats?.okr.activeUsers ?? 0} />}
        {stats && <CategoryPie categories={stats.categories} onSelect={selectCategory} />}
      </div>

      <CategoryDrilldownModal range={range} />
    </main>
  )
}
```

```tsx
// front/app/admin/page.tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/admin-auth'
import { AdminDashboard } from '@/components/admin/AdminDashboard'

// 서버에서 먼저 관리자 게이트 — 비관리자는 404 (존재 은닉)
export default async function AdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !isAdmin(user.id)) {
    notFound()
  }

  return <AdminDashboard />
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd front && npx vitest run components/admin/__tests__/AdminDashboard.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: 전체 유닛 테스트 + 타입 체크**

Run: `cd front && npx vitest run && npx tsc --noEmit`
Expected: 전체 PASS, 타입 에러 없음

- [ ] **Step 6: Commit**

```bash
git add front/components/admin/AdminDashboard.tsx front/app/admin/page.tsx front/components/admin/__tests__/AdminDashboard.test.tsx
git commit -m "feat(admin): /admin 대시보드 셸 + 서버 게이트 조립"
```

---

## Task 10: 환경변수 문서화 + E2E 저니

**Files:**
- Modify: `front/.env.example` (있으면) — `ADMIN_USER_IDS`, `OPENAI_ADMIN_KEY` 추가
- Create: `front/e2e/admin.md`

- [ ] **Step 1: 환경변수 예시 추가**

`front/.env.example`에 아래 항목을 추가(파일 없으면 생성). **값은 비워둔다.**

```bash
# /admin 대시보드 — 관리자 user.id 쉼표 구분 allowlist (서버 전용)
ADMIN_USER_IDS=
# OpenAI Organization Usage/Costs API용 admin 키 (서버 전용, OPENAI_API_KEY와 별개)
OPENAI_ADMIN_KEY=
```

- [ ] **Step 2: E2E 저니 작성**

```markdown
<!-- front/e2e/admin.md -->
# E2E — /admin 대시보드

> Playwright는 CI 환경에서 실행. 세션 중 라이브 브라우저 조작 금지.

## 사전조건
- `ADMIN_USER_IDS`에 테스트 관리자 계정 user.id 포함
- 관리자 계정으로 로그인된 세션

## 저니 1: 비관리자 차단
1. 비관리자 계정으로 `/admin` 접속
2. 기대: 404 페이지

## 저니 2: 관리자 기본 뷰
1. 관리자 계정으로 `/admin` 접속
2. 기대: OKR 타일 4개, OpenAI 사용량 위젯, 카테고리 도넛 표시
3. range 탭 `30d` 클릭 → URL이 `?range=30d`로 변경, 데이터 갱신

## 저니 3: 카테고리 드릴다운 (URL 동기화 모달)
1. 카테고리 도넛에서 슬라이스(또는 범례 버튼) 클릭
2. 기대: URL `?range=…&category=<name>`, 모달에 하위 태그 도넛 표시
3. 페이지 새로고침 → 모달 상태 복원(딥링크 검증)
4. 닫기(✕ 또는 배경 클릭) → `category` 파라미터 제거, 모달 닫힘

## 저니 4: 사용량 조회 불가 처리
1. `OPENAI_ADMIN_KEY` 미설정 환경
2. 기대: OpenAI 위젯에 "사용량 조회 불가" 명시(무음 실패 없음)
```

- [ ] **Step 3: Commit**

```bash
git add front/.env.example front/e2e/admin.md
git commit -m "docs(admin): 환경변수 예시 + E2E 저니 문서화"
```

---

## Task 11: 보안 감사 + 최종 검증

**Files:** 없음 (검증 전용)

- [ ] **Step 1: security-auditor 에이전트 실행**

`security-auditor` 에이전트로 `front/app/api/admin/**`, `front/lib/admin-auth.ts`, 마이그레이션 diff 검사.
확인 항목:
- 응답에 `embedding`·`content`·`description`·`user_id` 부재
- `select('*')` 미사용 (RPC 집계만)
- `ADMIN_USER_IDS`·`OPENAI_ADMIN_KEY`·`SERVICE_ROLE_KEY`에 `NEXT_PUBLIC_` 접두어 없음
- OpenAI 키 클라이언트 번들 미노출(서버 라우트에서만 참조)
- 비관리자 404, 미인증 401

- [ ] **Step 2: 린트 + 전체 테스트 + 빌드**

Run: `cd front && npm run lint && npx vitest run && npx tsc --noEmit`
Expected: 전체 통과

- [ ] **Step 3: 태스크 문서 갱신 (프로젝트 규약)**

`CLAUDE.md` 태스크 완료 절차에 따라:
- `tasks/README.md` — admin 대시보드 항목 추가(예: A67) + 진행률 갱신
- `front/tasks.json` — 해당 태스크 `status: done` 등록

- [ ] **Step 4: Commit**

```bash
git add tasks/README.md front/tasks.json
git commit -m "docs(tasks): admin 대시보드 태스크 등록"
```

---

## Self-Review 결과

**Spec 커버리지:**
- 관리자 게이팅 → Task 1 · 9 ✅
- range 1d/7d/30d → Task 2 · 9 ✅
- [A] OKR 타일(MVP) → Task 3(SQL)·4(API)·7(UI)·9 ✅
- [B] OpenAI 사용량(Usage API) → Task 5 · 7 ✅
- [C] 카테고리 원형 → Task 3 · 4 · 8 ✅
- [D] URL 동기화 모달 드릴다운 → Task 8 ✅
- 보안(집계값만·키·404) → Task 4 · 5 · 11 ✅
- [E] 데이터 건강도 / 검색 사용률 · p95 → **Phase 2 (범위 밖, 스펙에서 분리 명시)**

**타입 일관성:** `Okr`/`Usage`/`CategoryStat`/`DonutDatum`/`AdminRange` 시그니처가 Task 간 일치. `admin_*_stats` RPC 인자명(`p_interval`/`p_category`)이 Task 3 정의와 Task 4 호출에서 일치.

**플레이스홀더:** 없음. 모든 코드 스텝에 실제 구현 포함.
