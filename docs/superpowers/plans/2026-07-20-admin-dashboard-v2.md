# /admin 대시보드 v2 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 집계 전용 `/admin`을 마케팅·유저관리·북마크 동향 관리 대시보드로 재정의. 도넛 폐기, 랭킹막대+영역그래프 도입, 관리자 승격/강등 UI 추가.

**Architecture:** Next.js 16 App Router. 신규 RPC(security definer, service_role 전용)로 전체 집계. `GET /api/admin/stats` payload 확장 + 신규 `/api/admin/admins` 라우트. recharts(영역) + CSS 막대(분포). Mowaba 라이트 디자인(DESIGN.md), 이탤릭 금지.

**Tech Stack:** TypeScript, React 19, Next.js 16, Supabase(Postgres RPC), recharts, Tailwind v4, vitest + @testing-library/react.

**전제 제약:**
- Supabase MCP 미연결 → 마이그레이션(Task 1·2)은 SQL 파일 작성 후 **사용자가 SQL Editor에서 수동 실행**. 검증 쿼리 제공.
- 신규 RPC 전부 0026 패턴: `security definer` + `set search_path = public`, `service_role`만 grant, `PUBLIC`/`anon`/`authenticated` 명시 revoke.
- 보안 불변: embedding/content/개별유저 북마크 미노출. `withAdmin` 게이팅. Zod `safeParse`.
- Fact-Forcing Gate: 각 파일 첫 Edit/Write 전 importers/callers·영향 API·스키마·유저지시 공시.

---

## File Structure

```
supabase/migrations/
  0028_admin_v2_stats_functions.sql   (신규: growth/trending/health RPC)
  0029_admin_management_functions.sql (신규: list/grant/revoke RPC)
front/components/admin/
  BarList.tsx            (신규 공유: 랭킹 가로막대)
  GrowthChart.tsx        (신규: recharts AreaChart)
  TrendingTags.tsx       (신규)
  HealthStats.tsx        (신규)
  CategoryBar.tsx        (신규: BarList 래핑, 클릭→드릴다운)
  AdminManager.tsx       (신규: 관리자 목록+승격+강등)
  AdminDashboard.tsx     (수정: 레이아웃 재편, payload 확장)
  CategoryDrilldownModal.tsx (수정: DonutChart→BarList)
  CategoryPie.tsx        (삭제)
  DonutChart.tsx         (삭제)
  __tests__/*.test.tsx   (신규/수정)
front/app/api/admin/
  stats/route.ts         (수정: growth/trending/health 추가)
  admins/route.ts        (신규)
  __tests__/*.test.ts    (신규/수정)
docs/specs/database.md   (수정: 신규 RPC 시그니처)
tasks/README.md, front/tasks.json (수정: A67 범위 확장 주석)
```

---

## Task 1: 마이그레이션 0028 — 성장/트렌딩/건강 RPC

**Files:**
- Create: `supabase/migrations/0028_admin_v2_stats_functions.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- supabase/migrations/0028_admin_v2_stats_functions.sql
-- /admin v2 집계 함수. service_role 전용. 반환은 집계값만 — embedding/content/user_id 미노출.

-- 성장 추이: 신규 가입(auth.users) + 저장(bookmarks) 시계열.
-- 1d=시간별, 7d/30d=일별 버킷. generate_series로 빈 버킷 0-채움(연속 그래프).
create or replace function admin_growth_series(p_interval text)
returns table(bucket timestamptz, signups bigint, saves bigint)
language sql stable security definer set search_path = public
as $$
  with cfg as (
    select
      case p_interval when '1 day' then interval '1 day'
                      when '7 days' then interval '7 days'
                      else interval '30 days' end as win,
      case p_interval when '1 day' then interval '1 hour' else interval '1 day' end as step,
      case p_interval when '1 day' then 'hour' else 'day' end as unit
  ),
  buckets as (
    select generate_series(
      date_trunc((select unit from cfg), now() - (select win from cfg)),
      date_trunc((select unit from cfg), now()),
      (select step from cfg)
    ) as bucket
  )
  select
    b.bucket,
    (select count(*) from auth.users u
       where date_trunc((select unit from cfg), u.created_at) = b.bucket)::bigint as signups,
    (select count(*) from bookmarks bm
       where date_trunc((select unit from cfg), bm.created_at) = b.bucket)::bigint as saves
  from buckets b
  order by b.bucket;
$$;

-- 트렌딩 태그: 현재 윈도우 vs 직전 동일 윈도우 delta 상위 10.
create or replace function admin_trending_tags(p_interval text)
returns table(tag text, count bigint, prev_count bigint)
language sql stable security definer set search_path = public
as $$
  with cfg as (
    select case p_interval when '1 day' then interval '1 day'
                           when '7 days' then interval '7 days'
                           else interval '30 days' end as win
  ),
  cur as (
    select t as tag, count(*)::bigint as c
    from bookmarks b cross join lateral unnest(b.tags) as t
    where b.created_at >= now() - (select win from cfg)
    group by t
  ),
  prev as (
    select t as tag, count(*)::bigint as c
    from bookmarks b cross join lateral unnest(b.tags) as t
    where b.created_at >= now() - 2 * (select win from cfg)
      and b.created_at <  now() - (select win from cfg)
    group by t
  )
  select coalesce(cur.tag, prev.tag) as tag,
         coalesce(cur.c, 0) as count,
         coalesce(prev.c, 0) as prev_count
  from cur full outer join prev on cur.tag = prev.tag
  where coalesce(cur.c, 0) > 0
  order by (coalesce(cur.c, 0) - coalesce(prev.c, 0)) desc, coalesce(cur.c, 0) desc
  limit 10;
$$;

-- 건강 지표: 데드링크·미분류 누적 비율(전체 기간, 무인자).
create or replace function admin_health_stats()
returns table(dead_ratio numeric, uncategorized_ratio numeric)
language sql stable security definer set search_path = public
as $$
  select
    coalesce(avg((is_dead)::int), 0)::numeric as dead_ratio,
    coalesce(avg((category_id is null)::int), 0)::numeric as uncategorized_ratio
  from bookmarks;
$$;

grant execute on function admin_growth_series(text) to service_role;
grant execute on function admin_trending_tags(text) to service_role;
grant execute on function admin_health_stats() to service_role;

revoke execute on function admin_growth_series(text) from anon, authenticated, public;
revoke execute on function admin_trending_tags(text) from anon, authenticated, public;
revoke execute on function admin_health_stats() from anon, authenticated, public;
```

> `p_interval`은 기존 `rangeToInterval` 반환값(`'1 day'`/`'7 days'`/`'30 days'`)을 그대로 받음 — 0026 함수와 호출 규약 동일.

- [ ] **Step 2: 사용자에게 수동 실행 요청 + 검증**

사용자가 SQL Editor에서 파일 내용 실행 후 검증:
```sql
select * from admin_growth_series('7 days');   -- 8행(일별) 반환, signups/saves 숫자
select * from admin_trending_tags('7 days');   -- 최대 10행, delta 내림차순
select * from admin_health_stats();            -- 1행, 0~1 비율
```
`anon`/`authenticated`로는 `permission denied` 확인(선택).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0028_admin_v2_stats_functions.sql
git commit -m "feat(admin): v2 성장/트렌딩/건강 집계 RPC 추가 (0028)"
```

---

## Task 2: 마이그레이션 0029 — 관리자 목록/승격/강등 RPC

**Files:**
- Create: `supabase/migrations/0029_admin_management_functions.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- supabase/migrations/0029_admin_management_functions.sql
-- 관리자 관리(목록/승격/강등) RPC. service_role 전용.
-- 관리자(소수 신뢰집합) 이메일만 노출 — 일반 유저 PII 아님.

-- 현재 관리자 목록 (admin_users ⨝ auth.users)
create or replace function admin_list_admins()
returns table(user_id uuid, email text, granted_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select a.user_id, u.email::text, a.granted_at
  from admin_users a
  join auth.users u on u.id = a.user_id
  order by a.granted_at;
$$;

-- 이메일로 승격: email→id 해석 후 upsert. 미존재 시 예외.
create or replace function admin_grant_by_email(p_email text, p_granted_by uuid)
returns table(user_id uuid, email text)
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then
    raise exception 'user not found' using errcode = 'no_data_found';
  end if;
  insert into admin_users(user_id, granted_by)
  values (v_id, p_granted_by)
  on conflict (user_id) do nothing;
  return query select v_id, p_email;
end;
$$;

-- 강등
create or replace function admin_revoke(p_user_id uuid)
returns void
language sql security definer set search_path = public
as $$
  delete from admin_users where user_id = p_user_id;
$$;

grant execute on function admin_list_admins() to service_role;
grant execute on function admin_grant_by_email(text, uuid) to service_role;
grant execute on function admin_revoke(uuid) to service_role;

revoke execute on function admin_list_admins() from anon, authenticated, public;
revoke execute on function admin_grant_by_email(text, uuid) from anon, authenticated, public;
revoke execute on function admin_revoke(uuid) from anon, authenticated, public;
```

- [ ] **Step 2: 사용자 수동 실행 + 검증**

```sql
select * from admin_list_admins();  -- 현재 관리자 1행 이상(이메일 포함)
-- 승격/강등은 라우트 테스트(Task 7)에서 커버, 여기선 목록만 확인
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0029_admin_management_functions.sql
git commit -m "feat(admin): 관리자 목록/승격/강등 RPC 추가 (0029)"
```

---

## Task 3: BarList 공유 컴포넌트 (분포·드릴다운 공용)

**Files:**
- Create: `front/components/admin/BarList.tsx`
- Test: `front/components/admin/__tests__/BarList.test.tsx`

DonutChart를 대체. `{label, value, pct}` 데이터로 랭킹 가로막대 렌더. `onSelect` 있으면 라벨을 버튼으로. 건수 1차 표기 + 비율 괄호 보조(기존 통일 규칙 계승).

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// front/components/admin/__tests__/BarList.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { BarList } from '../BarList'

const data = [
  { label: '개발', value: 30, pct: 0.75 },
  { label: '여행', value: 10, pct: 0.25 },
]

describe('BarList', () => {
  it('각 항목 라벨·건수·비율 렌더', () => {
    render(<BarList data={data} />)
    expect(screen.getByText('개발')).toBeInTheDocument()
    expect(screen.getByText('30건 (75%)')).toBeInTheDocument()
    expect(screen.getByText('10건 (25%)')).toBeInTheDocument()
  })

  it('데이터 없으면 안내 문구', () => {
    render(<BarList data={[]} />)
    expect(screen.getByText('데이터 없음')).toBeInTheDocument()
  })

  it('onSelect 있으면 라벨 클릭 시 콜백', () => {
    const onSelect = vi.fn()
    render(<BarList data={data} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: '개발' }))
    expect(onSelect).toHaveBeenCalledWith('개발')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd front && npx vitest run components/admin/__tests__/BarList.test.tsx`
Expected: FAIL (BarList 미존재)

- [ ] **Step 3: BarList 구현**

```tsx
// front/components/admin/BarList.tsx
export type BarDatum = { label: string; value: number; pct: number }

// Mowaba 브랜드 축 단색 — 색은 의미 아니라 순위 시각화용
export function BarList({
  data,
  onSelect,
}: {
  data: BarDatum[]
  onSelect?: (label: string) => void
}) {
  if (data.length === 0) {
    return <p className="text-sm text-text-secondary">데이터 없음</p>
  }
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <ul className="space-y-2">
      {data.map((d) => {
        const roundedPct = Math.round(d.pct * 100)
        const widthPct = Math.max((d.value / max) * 100, 2)
        return (
          <li key={d.label} className="text-sm">
            <div className="mb-1 flex items-center justify-between gap-2">
              {onSelect ? (
                <button
                  type="button"
                  className="text-left text-text-primary hover:text-brand hover:underline"
                  onClick={() => onSelect(d.label)}
                >
                  {d.label}
                </button>
              ) : (
                <span className="text-text-primary">{d.label}</span>
              )}
              <span className="tabular-nums text-text-secondary">
                {d.value}건 (<span className="tabular-nums">{roundedPct}%</span>)
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-brand" style={{ width: `${widthPct}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
```

> `10건 (25%)` 텍스트가 한 span에 연속으로 렌더되도록 배치 — 테스트 exact-text 매칭 통과. 내부 `<span>{roundedPct}%</span>`는 개별 % 매칭 호환용.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd front && npx vitest run components/admin/__tests__/BarList.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add front/components/admin/BarList.tsx front/components/admin/__tests__/BarList.test.tsx
git commit -m "feat(admin): BarList 랭킹 가로막대 공유 컴포넌트 추가"
```

---

## Task 4: GrowthChart 컴포넌트 (영역그래프)

**Files:**
- Create: `front/components/admin/GrowthChart.tsx`
- Test: `front/components/admin/__tests__/GrowthChart.test.tsx`

recharts `AreaChart`로 signups/saves 2 series. 카드 컨테이너 + 제목.

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// front/components/admin/__tests__/GrowthChart.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { GrowthChart, type GrowthPoint } from '../GrowthChart'

const data: GrowthPoint[] = [
  { bucket: '2026-07-14T00:00:00Z', signups: 2, saves: 10 },
  { bucket: '2026-07-15T00:00:00Z', signups: 1, saves: 8 },
]

describe('GrowthChart', () => {
  it('제목·범례 렌더', () => {
    render(<GrowthChart data={data} />)
    expect(screen.getByText('성장 추이')).toBeInTheDocument()
    expect(screen.getByText('신규 가입')).toBeInTheDocument()
    expect(screen.getByText('저장')).toBeInTheDocument()
  })

  it('데이터 없으면 안내 문구', () => {
    render(<GrowthChart data={[]} />)
    expect(screen.getByText('데이터 없음')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd front && npx vitest run components/admin/__tests__/GrowthChart.test.tsx`
Expected: FAIL

- [ ] **Step 3: 구현**

```tsx
// front/components/admin/GrowthChart.tsx
'use client'

import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Legend } from 'recharts'

export type GrowthPoint = { bucket: string; signups: number; saves: number }

// bucket ISO → 짧은 라벨(월/일)
function fmt(bucket: string): string {
  const d = new Date(bucket)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function GrowthChart({ data }: { data: GrowthPoint[] }) {
  return (
    <section className="rounded-lg border border-line bg-surface-card p-4">
      <h2 className="mb-3 text-sm font-medium text-text-secondary">성장 추이</h2>
      {data.length === 0 ? (
        <p className="text-sm text-text-secondary">데이터 없음</p>
      ) : (
        <>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.map((d) => ({ ...d, label: fmt(d.bucket) }))}>
                <defs>
                  <linearGradient id="gSignups" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4a90e2" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#4a90e2" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gSaves" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#48c9b0" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#48c9b0" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                <Legend formatter={(v) => (v === 'signups' ? '신규 가입' : '저장')} wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="signups" stroke="#4a90e2" fill="url(#gSignups)" strokeWidth={2} />
                <Area type="monotone" dataKey="saves" stroke="#48c9b0" fill="url(#gSaves)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {/* 접근성: recharts SVG는 스크린리더 비친화 → 텍스트 요약 병기 */}
          <p className="sr-only">
            {data.map((d) => `${fmt(d.bucket)} 신규 가입 ${d.signups}, 저장 ${d.saves}`).join('; ')}
          </p>
        </>
      )}
    </section>
  )
}
```

> `Legend`가 '신규 가입'/'저장' 텍스트 렌더 → 테스트 통과. `sr-only` 요약 추가(a11y).

- [ ] **Step 4: 통과 확인**

Run: `cd front && npx vitest run components/admin/__tests__/GrowthChart.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add front/components/admin/GrowthChart.tsx front/components/admin/__tests__/GrowthChart.test.tsx
git commit -m "feat(admin): GrowthChart 성장 추이 영역그래프 추가"
```

---

## Task 5: TrendingTags + HealthStats 컴포넌트

**Files:**
- Create: `front/components/admin/TrendingTags.tsx`, `front/components/admin/HealthStats.tsx`
- Test: `front/components/admin/__tests__/TrendingTags.test.tsx`, `front/components/admin/__tests__/HealthStats.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// front/components/admin/__tests__/TrendingTags.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TrendingTags, type TrendingTag } from '../TrendingTags'

const data: TrendingTag[] = [
  { tag: 'AI', count: 12, prevCount: 4 },
  { tag: 'React', count: 5, prevCount: 5 },
]

describe('TrendingTags', () => {
  it('태그·delta 렌더', () => {
    render(<TrendingTags data={data} />)
    expect(screen.getByText('AI')).toBeInTheDocument()
    expect(screen.getByText('+8')).toBeInTheDocument()   // 12-4
    expect(screen.getByText('0')).toBeInTheDocument()    // 5-5
  })

  it('데이터 없으면 안내', () => {
    render(<TrendingTags data={[]} />)
    expect(screen.getByText('데이터 없음')).toBeInTheDocument()
  })
})
```

```tsx
// front/components/admin/__tests__/HealthStats.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { HealthStats } from '../HealthStats'

describe('HealthStats', () => {
  it('데드링크·미분류 비율 % 렌더', () => {
    render(<HealthStats deadRatio={0.12} uncategorizedRatio={0.3} />)
    expect(screen.getByText('12%')).toBeInTheDocument()
    expect(screen.getByText('30%')).toBeInTheDocument()
    expect(screen.getByText('데드링크')).toBeInTheDocument()
    expect(screen.getByText('미분류')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd front && npx vitest run components/admin/__tests__/TrendingTags.test.tsx components/admin/__tests__/HealthStats.test.tsx`
Expected: FAIL

- [ ] **Step 3: 구현**

```tsx
// front/components/admin/TrendingTags.tsx
export type TrendingTag = { tag: string; count: number; prevCount: number }

export function TrendingTags({ data }: { data: TrendingTag[] }) {
  return (
    <section className="rounded-lg border border-line bg-surface-card p-4">
      <h2 className="mb-3 text-sm font-medium text-text-secondary">트렌딩 태그</h2>
      {data.length === 0 ? (
        <p className="text-sm text-text-secondary">데이터 없음</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {data.map((d) => {
            const delta = d.count - d.prevCount
            const up = delta > 0
            const flat = delta === 0
            const deltaLabel = up ? `+${delta}` : String(delta)
            const color = up ? 'text-mint' : flat ? 'text-text-secondary' : 'text-destructive'
            return (
              <li key={d.tag} className="flex items-center justify-between gap-2 border-b border-line py-1 last:border-b-0">
                <span className="text-text-primary">{d.tag}</span>
                <span className="flex items-center gap-2 tabular-nums">
                  <span className="text-text-secondary">{d.count}건</span>
                  <span className={`text-xs ${color}`}>{deltaLabel}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
```

```tsx
// front/components/admin/HealthStats.tsx
function Metric({ label, ratio }: { label: string; ratio: number }) {
  const pct = Math.round((Number.isFinite(ratio) ? ratio : 0) * 100)
  return (
    <div>
      <div className="text-sm text-text-secondary">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">{pct}%</div>
    </div>
  )
}

export function HealthStats({
  deadRatio,
  uncategorizedRatio,
}: {
  deadRatio: number
  uncategorizedRatio: number
}) {
  return (
    <section className="h-full rounded-lg border border-line bg-surface-card p-4">
      <h2 className="mb-3 text-sm font-medium text-text-secondary">건강 지표</h2>
      <div className="grid grid-cols-2 gap-4">
        <Metric label="데드링크" ratio={deadRatio} />
        <Metric label="미분류" ratio={uncategorizedRatio} />
      </div>
    </section>
  )
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd front && npx vitest run components/admin/__tests__/TrendingTags.test.tsx components/admin/__tests__/HealthStats.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add front/components/admin/TrendingTags.tsx front/components/admin/HealthStats.tsx front/components/admin/__tests__/TrendingTags.test.tsx front/components/admin/__tests__/HealthStats.test.tsx
git commit -m "feat(admin): TrendingTags·HealthStats 컴포넌트 추가"
```

---

## Task 6: `GET /api/admin/stats` payload 확장

**Files:**
- Modify: `front/app/api/admin/stats/route.ts`
- Test: `front/app/api/admin/__tests__/stats.test.ts` (기존 수정)

기본 payload에 `growth`, `trending`, `health` 추가. 드릴다운(`?category=`) 분기는 불변.

- [ ] **Step 1: 실패 테스트 작성 (기존 테스트에 케이스 추가)**

기존 `stats.test.ts`의 supabase mock에 신규 RPC 3종 응답 추가, 기본 payload 검증에 다음 추가:

```ts
// admin.rpc mock 분기: 'admin_growth_series' → [{bucket, signups, saves}],
//   'admin_trending_tags' → [{tag, count, prev_count}], 'admin_health_stats' → [{dead_ratio, uncategorized_ratio}]

it('기본 payload에 growth/trending/health 포함', async () => {
  // 기존 mock 세팅 + 신규 3종 (bigint/numeric은 string으로)
  const res = await GET(new Request('http://x/api/admin/stats?range=7d'))
  const body = await res.json()
  expect(body.growth).toEqual([{ bucket: expect.any(String), signups: 2, saves: 10 }])
  expect(body.trending).toEqual([{ tag: 'AI', count: 12, prevCount: 4 }])
  expect(body.health).toEqual({ deadRatio: 0.12, uncategorizedRatio: 0.3 })
})
```

> 기존 mock이 특정 RPC만 처리하면 신규 RPC는 `{data:null,error:null}` 반환하도록 기본 분기 보강. bigint/numeric은 string으로 오므로 mock 값도 string(`'2'`,`'0.12'`)으로 넣어 `Number()` 변환 검증.

- [ ] **Step 2: 실패 확인**

Run: `cd front && npx vitest run app/api/admin/__tests__/stats.test.ts`
Expected: FAIL (growth undefined)

- [ ] **Step 3: 라우트 확장**

`stats/route.ts` 기본 분기(카테고리 없을 때) `Promise.all`에 3종 추가, 응답에 매핑 추가:

```ts
  // 기본: OKR + 카테고리 분포 + 성장/트렌딩/건강
  const [okrRes, catRes, growthRes, trendRes, healthRes] = await Promise.all([
    admin.rpc('admin_okr_stats', { p_interval: interval }),
    admin.rpc('admin_category_stats', { p_interval: interval }),
    admin.rpc('admin_growth_series', { p_interval: interval }),
    admin.rpc('admin_trending_tags', { p_interval: interval }),
    admin.rpc('admin_health_stats'),
  ])
  if (okrRes.error) return NextResponse.json({ error: okrRes.error.message }, { status: 500 })
  if (catRes.error) return NextResponse.json({ error: catRes.error.message }, { status: 500 })
  if (growthRes.error) return NextResponse.json({ error: growthRes.error.message }, { status: 500 })
  if (trendRes.error) return NextResponse.json({ error: trendRes.error.message }, { status: 500 })
  if (healthRes.error) return NextResponse.json({ error: healthRes.error.message }, { status: 500 })

  const o = okrRes.data?.[0] ?? { active_users: 0, first_save_rate: 0, saves_per_user: 0, new_saves: 0 }
  const categories = withPct((catRes.data ?? []) as CountRow[], 'name')
  const growth = ((growthRes.data ?? []) as Array<{ bucket: string; signups: number | string; saves: number | string }>)
    .map((r) => ({ bucket: r.bucket, signups: Number(r.signups), saves: Number(r.saves) }))
  const trending = ((trendRes.data ?? []) as Array<{ tag: string; count: number | string; prev_count: number | string }>)
    .map((r) => ({ tag: r.tag, count: Number(r.count), prevCount: Number(r.prev_count) }))
  const h = (healthRes.data?.[0] ?? { dead_ratio: 0, uncategorized_ratio: 0 }) as { dead_ratio: number | string; uncategorized_ratio: number | string }
  const health = { deadRatio: Number(h.dead_ratio), uncategorizedRatio: Number(h.uncategorized_ratio) }

  return NextResponse.json({
    range,
    okr: {
      activeUsers: Number(o.active_users),
      firstSaveRate: Number(o.first_save_rate),
      savesPerUser: Number(o.saves_per_user),
      newSaves: Number(o.new_saves),
    },
    categories,
    growth,
    trending,
    health,
  })
```

- [ ] **Step 4: 통과 확인**

Run: `cd front && npx vitest run app/api/admin/__tests__/stats.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add front/app/api/admin/stats/route.ts front/app/api/admin/__tests__/stats.test.ts
git commit -m "feat(admin): stats API에 성장/트렌딩/건강 payload 추가"
```

---

## Task 7: `/api/admin/admins` 라우트 (목록/승격/강등)

**Files:**
- Create: `front/app/api/admin/admins/route.ts`
- Test: `front/app/api/admin/__tests__/admins.test.ts`

`withAdmin(async (req, ctx) => ...)` — `ctx.user.id`를 `granted_by`·본인강등 방지에 사용.

- [ ] **Step 1: 실패 테스트 작성**

```ts
// front/app/api/admin/__tests__/admins.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// withAdmin: ctx.user.id 고정 주입하는 pass-through mock
vi.mock('@/lib/admin-auth', () => ({
  withAdmin: (h: (req: Request, ctx: { user: { id: string } }) => unknown) =>
    (req: Request) => h(req, { user: { id: 'me-uuid' } }),
}))

const rpc = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }))

import { GET, POST, DELETE } from '../../admins/route'

beforeEach(() => rpc.mockReset())

describe('GET /api/admin/admins', () => {
  it('관리자 목록 반환', async () => {
    rpc.mockResolvedValue({ data: [{ user_id: 'u1', email: 'a@b.com', granted_at: '2026-07-01T00:00:00Z' }], error: null })
    const res = await GET(new Request('http://x/api/admin/admins'))
    const body = await res.json()
    expect(body.admins).toEqual([{ userId: 'u1', email: 'a@b.com', grantedAt: '2026-07-01T00:00:00Z' }])
  })
})

describe('POST /api/admin/admins', () => {
  it('이메일 승격', async () => {
    rpc.mockResolvedValue({ data: [{ user_id: 'u2', email: 'new@b.com' }], error: null })
    const res = await POST(new Request('http://x/api/admin/admins', { method: 'POST', body: JSON.stringify({ email: 'new@b.com' }) }))
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('admin_grant_by_email', { p_email: 'new@b.com', p_granted_by: 'me-uuid' })
  })

  it('잘못된 이메일 400', async () => {
    const res = await POST(new Request('http://x/api/admin/admins', { method: 'POST', body: JSON.stringify({ email: 'nope' }) }))
    expect(res.status).toBe(400)
  })

  it('미존재 유저 422', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'user not found', code: 'no_data_found' } })
    const res = await POST(new Request('http://x/api/admin/admins', { method: 'POST', body: JSON.stringify({ email: 'ghost@b.com' }) }))
    expect(res.status).toBe(422)
  })
})

describe('DELETE /api/admin/admins', () => {
  it('강등', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    const res = await DELETE(new Request('http://x/api/admin/admins?userId=550e8400-e29b-41d4-a716-446655440000', { method: 'DELETE' }))
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('admin_revoke', { p_user_id: '550e8400-e29b-41d4-a716-446655440000' })
  })

  it('본인 강등 방지 400', async () => {
    // me-uuid는 uuid 형식이 아니므로 uuid 형식 본인 id로 테스트하려면
    // withAdmin mock의 user.id를 유효 uuid로 맞춰야 함 — 위 mock의 'me-uuid'를
    // 유효 uuid로 교체하거나 별도 describe에서 재-mock. 아래는 유효 uuid 가정.
    // (구현 시 withAdmin mock user.id를 '00000000-0000-4000-8000-000000000001'로 설정)
    const res = await DELETE(new Request('http://x/api/admin/admins?userId=00000000-0000-4000-8000-000000000001', { method: 'DELETE' }))
    expect(res.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('userId 형식 오류 400', async () => {
    const res = await DELETE(new Request('http://x/api/admin/admins?userId=', { method: 'DELETE' }))
    expect(res.status).toBe(400)
  })
})
```

> 구현자 참고: 본인강등 테스트를 위해 `withAdmin` mock의 `user.id`를 유효 uuid(`00000000-0000-4000-8000-000000000001`)로 설정하고, 승격/목록 테스트의 기대값도 동일 id로 맞출 것. 위 스니펫의 `'me-uuid'`는 유효 uuid로 교체.

- [ ] **Step 2: 실패 확인**

Run: `cd front && npx vitest run app/api/admin/__tests__/admins.test.ts`
Expected: FAIL (라우트 미존재)

- [ ] **Step 3: 라우트 구현**

```ts
// front/app/api/admin/admins/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'

const grantSchema = z.object({ email: z.string().trim().email() })
const userIdSchema = z.string().uuid()

export const GET = withAdmin(async () => {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('admin_list_admins')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const admins = ((data ?? []) as Array<{ user_id: string; email: string; granted_at: string }>).map((r) => ({
    userId: r.user_id,
    email: r.email,
    grantedAt: r.granted_at,
  }))
  return NextResponse.json({ admins })
})

export const POST = withAdmin(async (req, ctx) => {
  const parsed = grantSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('admin_grant_by_email', {
    p_email: parsed.data.email,
    p_granted_by: ctx.user.id,
  })
  if (error) {
    // RPC 'user not found'(no_data_found) 예외 → 422, 그 외 500
    const status = error.code === 'no_data_found' || /not found/i.test(error.message) ? 422 : 500
    return NextResponse.json({ error: '해당 이메일의 사용자를 찾을 수 없습니다' }, { status })
  }
  const row = (data as Array<{ user_id: string; email: string }>)?.[0]
  return NextResponse.json({ admin: row ? { userId: row.user_id, email: row.email } : null })
})

export const DELETE = withAdmin(async (req, ctx) => {
  const userId = new URL(req.url).searchParams.get('userId')
  const parsed = userIdSchema.safeParse(userId)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid userId' }, { status: 400 })
  }
  // 본인 강등 방지(잠금아웃 회피)
  if (parsed.data === ctx.user.id) {
    return NextResponse.json({ error: '본인은 강등할 수 없습니다' }, { status: 400 })
  }
  const admin = createAdminClient()
  const { error } = await admin.rpc('admin_revoke', { p_user_id: parsed.data })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
})
```

> `withAdmin` 시그니처 `(req, ctx)` — 기존 `admin-auth.ts` `AdminContext`(`{ user, supabase }`) 그대로. `ctx.user`는 `withAuth`가 주입.

- [ ] **Step 4: 통과 확인**

Run: `cd front && npx vitest run app/api/admin/__tests__/admins.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add front/app/api/admin/admins/route.ts front/app/api/admin/__tests__/admins.test.ts
git commit -m "feat(admin): 관리자 목록/승격/강등 API 라우트 추가"
```

---

## Task 8: AdminManager 컴포넌트 (관리자 관리 UI)

**Files:**
- Create: `front/components/admin/AdminManager.tsx`
- Test: `front/components/admin/__tests__/AdminManager.test.tsx`

마운트 시 `GET /api/admin/admins` fetch, 목록 렌더. 이메일 입력+승격 폼, 행별 강등 버튼. 액션 후 refetch. 에러 상태 표시.

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// front/components/admin/__tests__/AdminManager.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AdminManager } from '../AdminManager'

const admins = [{ userId: 'u1', email: 'a@b.com', grantedAt: '2026-07-01T00:00:00Z' }]

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return { ok: true, json: async () => ({ admin: { userId: 'u2', email: 'new@b.com' } }) }
    if (init?.method === 'DELETE') return { ok: true, json: async () => ({ ok: true }) }
    return { ok: true, json: async () => ({ admins }) }
  }))
})

describe('AdminManager', () => {
  it('관리자 목록 렌더', async () => {
    render(<AdminManager />)
    expect(await screen.findByText('a@b.com')).toBeInTheDocument()
  })

  it('이메일 입력 후 승격 호출', async () => {
    render(<AdminManager />)
    await screen.findByText('a@b.com')
    fireEvent.change(screen.getByPlaceholderText('이메일로 승격'), { target: { value: 'new@b.com' } })
    fireEvent.click(screen.getByRole('button', { name: '승격' }))
    await waitFor(() => {
      expect(fetch as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
        '/api/admin/admins',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd front && npx vitest run components/admin/__tests__/AdminManager.test.tsx`
Expected: FAIL

- [ ] **Step 3: 구현**

```tsx
// front/components/admin/AdminManager.tsx
'use client'

import { useEffect, useState } from 'react'

type Admin = { userId: string; email: string; grantedAt: string }

export function AdminManager() {
  const [admins, setAdmins] = useState<Admin[] | null>(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const res = await fetch('/api/admin/admins')
      if (!res.ok) throw new Error()
      const body = await res.json()
      setAdmins(body.admins ?? [])
    } catch {
      setError('관리자 목록을 불러오지 못했습니다')
    }
  }

  useEffect(() => {
    let alive = true
    fetch('/api/admin/admins')
      .then(async (res) => {
        if (!alive) return
        if (!res.ok) throw new Error()
        const body = await res.json()
        if (alive) setAdmins(body.admins ?? [])
      })
      .catch(() => {
        if (alive) setError('관리자 목록을 불러오지 못했습니다')
      })
    return () => {
      alive = false
    }
  }, [])

  const grant = async () => {
    if (!email.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/admins', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (!res.ok) {
        setError(res.status === 422 ? '해당 이메일의 사용자를 찾을 수 없습니다' : '승격 실패')
        return
      }
      setEmail('')
      await load()
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (userId: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/admins?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' })
      if (!res.ok) {
        setError('강등 실패')
        return
      }
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border border-line bg-surface-card p-4">
      <h2 className="mb-3 text-sm font-medium text-text-secondary">관리자 관리</h2>

      <div className="mb-3 flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일로 승격"
          className="flex-1 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-text-primary"
        />
        <button
          type="button"
          onClick={grant}
          disabled={busy}
          className="rounded-md bg-brand px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          승격
        </button>
      </div>

      {error && <p className="mb-2 text-sm text-destructive">{error}</p>}

      {admins === null ? (
        <p className="text-sm text-text-secondary">불러오는 중…</p>
      ) : admins.length === 0 ? (
        <p className="text-sm text-text-secondary">관리자 없음</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {admins.map((a) => (
            <li key={a.userId} className="flex items-center justify-between gap-2 border-b border-line py-1 last:border-b-0">
              <span className="text-text-primary">{a.email}</span>
              <button
                type="button"
                onClick={() => revoke(a.userId)}
                disabled={busy}
                className="text-xs text-text-secondary hover:text-destructive disabled:opacity-50"
              >
                강등
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

> 본인 강등은 API가 400으로 차단(잠금아웃 방지) — UI는 에러만 표시.

- [ ] **Step 4: 통과 확인**

Run: `cd front && npx vitest run components/admin/__tests__/AdminManager.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add front/components/admin/AdminManager.tsx front/components/admin/__tests__/AdminManager.test.tsx
git commit -m "feat(admin): AdminManager 관리자 관리 UI 추가"
```

---

## Task 9: AdminDashboard 레이아웃 재편 + 도넛 폐기 + 문서/태스크

**Files:**
- Modify: `front/components/admin/AdminDashboard.tsx`
- Modify: `front/components/admin/CategoryDrilldownModal.tsx` (DonutChart→BarList)
- Create: `front/components/admin/CategoryBar.tsx`
- Delete: `front/components/admin/CategoryPie.tsx`, `front/components/admin/DonutChart.tsx`, `front/components/admin/__tests__/DonutChart.test.tsx`
- Modify: `front/components/admin/__tests__/AdminDashboard.test.tsx`
- Modify: `docs/specs/database.md`, `tasks/README.md`, `front/tasks.json`

- [ ] **Step 1: CategoryBar 생성 (BarList 래핑)**

```tsx
// front/components/admin/CategoryBar.tsx
'use client'

import { BarList, type BarDatum } from './BarList'

export type CategoryStat = { name: string; count: number; pct: number }

export function CategoryBar({
  categories,
  onSelect,
}: {
  categories: CategoryStat[]
  onSelect: (name: string) => void
}) {
  const data: BarDatum[] = categories.map((c) => ({ label: c.name, value: c.count, pct: c.pct }))
  return (
    <section className="rounded-lg border border-line bg-surface-card p-4">
      <h2 className="mb-3 text-sm font-medium text-text-secondary">카테고리 분포</h2>
      <BarList data={data} onSelect={onSelect} />
    </section>
  )
}
```

- [ ] **Step 2: 드릴다운 모달 DonutChart→BarList 교체**

`CategoryDrilldownModal.tsx`:
- `import { DonutChart, type DonutDatum } from './DonutChart'` → `import { BarList, type BarDatum } from './BarList'`
- `const data: DonutDatum[] = ...` → `const data: BarDatum[] = ...`
- `<DonutChart data={data} />` → `<BarList data={data} />`
- 나머지 상태머신·escape·close 로직 불변.

- [ ] **Step 3: AdminDashboard 재편**

```tsx
// front/components/admin/AdminDashboard.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { ADMIN_RANGES, parseRange, type AdminRange } from '@/lib/admin-range'
import { OkrTiles, type Okr } from './OkrTiles'
import { OpenAiUsage, type Usage } from './OpenAiUsage'
import { CategoryBar, type CategoryStat } from './CategoryBar'
import { GrowthChart, type GrowthPoint } from './GrowthChart'
import { TrendingTags, type TrendingTag } from './TrendingTags'
import { HealthStats } from './HealthStats'
import { AdminManager } from './AdminManager'
import { CategoryDrilldownModal } from './CategoryDrilldownModal'

type Stats = {
  okr: Okr
  categories: CategoryStat[]
  growth: GrowthPoint[]
  trending: TrendingTag[]
  health: { deadRatio: number; uncategorizedRatio: number }
}

export function AdminDashboard() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const range = parseRange(params.get('range'))

  const [stats, setStats] = useState<Stats | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([fetch(`/api/admin/stats?range=${range}`), fetch(`/api/admin/openai-usage?range=${range}`)])
      .then(async ([statsRes, usageRes]) => {
        if (!alive) return
        if (!statsRes.ok) {
          setError('대시보드 데이터를 불러오지 못했습니다')
          return
        }
        const s = await statsRes.json()
        if (!alive) return
        if (!s || !s.okr || !s.categories) {
          setError('대시보드 데이터를 불러오지 못했습니다')
          return
        }
        const u = usageRes.ok
          ? await usageRes.json()
          : { available: false, totalCostUsd: 0, totalTokens: 0, byModel: [] }
        if (!alive) return
        setError(null)
        setStats({
          okr: s.okr,
          categories: s.categories,
          growth: s.growth ?? [],
          trending: s.trending ?? [],
          health: s.health ?? { deadRatio: 0, uncategorizedRatio: 0 },
        })
        setUsage(u)
      })
      .catch(() => {
        if (alive) setError('대시보드 데이터를 불러오지 못했습니다')
      })
    return () => {
      alive = false
    }
  }, [range])

  const setRange = (r: AdminRange) => {
    const next = new URLSearchParams(params)
    next.set('range', r)
    router.push(`${pathname}?${next.toString()}`)
  }
  const selectCategory = (name: string) => {
    const next = new URLSearchParams(params)
    next.set('category', name)
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 bg-surface px-6 py-10 font-sans">
      <div className="flex items-end justify-between border-b border-line pb-4">
        <div>
          <div className="text-xs font-medium tracking-wide text-text-secondary">내부 운영</div>
          <h1 className="mt-1 text-xl font-semibold text-text-primary">관리자 대시보드</h1>
        </div>
        <div className="flex gap-1 rounded-lg border border-line bg-surface-card p-1">
          {ADMIN_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={r === range}
              onClick={() => setRange(r)}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${
                r === range ? 'bg-brand text-white' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : stats ? (
        <OkrTiles okr={stats.okr} />
      ) : (
        <p className="text-sm text-text-secondary">불러오는 중…</p>
      )}

      {!error && stats && (
        <>
          <GrowthChart data={stats.growth} />

          <div className="grid gap-4 sm:grid-cols-2">
            <CategoryBar categories={stats.categories} onSelect={selectCategory} />
            <TrendingTags data={stats.trending} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <HealthStats deadRatio={stats.health.deadRatio} uncategorizedRatio={stats.health.uncategorizedRatio} />
            {usage && <OpenAiUsage usage={usage} activeUsers={stats.okr.activeUsers} />}
          </div>

          <AdminManager />
        </>
      )}

      {!error && <CategoryDrilldownModal range={range} />}
    </main>
  )
}
```

- [ ] **Step 4: 삭제 + 기존 테스트 갱신**

- 삭제: `CategoryPie.tsx`, `DonutChart.tsx`, `__tests__/DonutChart.test.tsx`
- `AdminDashboard.test.tsx`: mock stats 응답에 `growth:[]`, `trending:[]`, `health:{deadRatio:0,uncategorizedRatio:0}` 추가. `CategoryPie`→`CategoryBar` 참조 갱신. `AdminManager`가 마운트 시 `/api/admin/admins` fetch하므로 mock fetch에 해당 분기(`{admins:[]}`) 추가.

- [ ] **Step 5: admin 전체 테스트 + 타입/린트/빌드**

```bash
cd front
npx vitest run components/admin/ app/api/admin/
npx tsc --noEmit
npx eslint .
```
Expected: 전부 PASS/clean. `CategoryPie`/`DonutChart` 잔여 import 없음 확인.

- [ ] **Step 6: 문서 + 태스크 갱신**

- `docs/specs/database.md` §관리자 대시보드 집계(A67)에 0028·0029 신규 RPC 시그니처 6종 추가.
- `tasks/README.md` A67 항목 설명에 "v2 재정의(성장/동향/관리자관리)" 주석, 진행률 유지.
- `front/tasks.json` A67 항목 설명 동기화.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(admin): 대시보드 v2 레이아웃 재편 + 도넛 폐기(BarList 전환) + 문서 갱신"
```

---

## 최종 검토

전 태스크 완료 후:
- `cd front && npx vitest run && npx tsc --noEmit && npx eslint .` 전체 green
- 보안 재확인: 신규 RPC service_role 전용, `withAdmin` 게이팅, Zod 검증, embedding/content/개별유저 미노출
- 사용자에게 0028·0029 SQL Editor 실행 확인 요청 + `/admin` 새로고침 시각 검증 요청
- superpowers:finishing-a-development-branch로 마무리
