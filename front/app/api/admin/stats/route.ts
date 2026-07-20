import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseRange, rangeToInterval } from '@/lib/admin-range'

type CountRow = { name?: string; tag?: string; count: number | string }

const querySchema = z.object({
  category: z.string().trim().max(50).optional(),
})

// count 합계 대비 각 행의 비율(pct)을 계산해 % 집계 응답을 구성.
function withPct(rows: CountRow[], key: 'name' | 'tag') {
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
  const parsed = querySchema.safeParse({
    category: url.searchParams.get('category') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const { category } = parsed.data
  const admin = createAdminClient()

  // 드릴다운: 카테고리 → 하위 태그
  if (category) {
    const { data, error } = await admin.rpc('admin_tag_stats', {
      p_category: category,
      p_interval: interval,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const tags = withPct((data ?? []) as CountRow[], 'tag')
    return NextResponse.json({ range, category, tags })
  }

  // 기본: OKR + 카테고리 분포
  const [okrRes, catRes] = await Promise.all([
    admin.rpc('admin_okr_stats', { p_interval: interval }),
    admin.rpc('admin_category_stats', { p_interval: interval }),
  ])
  if (okrRes.error) return NextResponse.json({ error: okrRes.error.message }, { status: 500 })
  if (catRes.error) return NextResponse.json({ error: catRes.error.message }, { status: 500 })

  const o = okrRes.data?.[0] ?? {
    active_users: 0,
    first_save_rate: 0,
    saves_per_user: 0,
    new_saves: 0,
  }
  const categories = withPct((catRes.data ?? []) as CountRow[], 'name')

  return NextResponse.json({
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
