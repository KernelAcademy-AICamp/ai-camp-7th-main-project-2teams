import { describe, it, expect } from 'vitest'
import { planUrlBackfill, type BackfillRow } from '../backfillUrlPlan'

const row = (id: string, user_id: string, url: string, created_at: string): BackfillRow => ({
  id,
  user_id,
  url,
  created_at,
})

describe('planUrlBackfill', () => {
  it('정규화로 이미 canonical이고 중복 없으면 변경 없음', () => {
    const plan = planUrlBackfill([row('1', 'u1', 'https://ex.com/a', '2026-01-01')])
    expect(plan.updates).toEqual([])
    expect(plan.deleteIds).toEqual([])
  })

  it('비정규 URL은 canonical로 업데이트', () => {
    const plan = planUrlBackfill([row('1', 'u1', 'https://ex.com/a/?utm_source=x#top', '2026-01-01')])
    expect(plan.updates).toEqual([{ id: '1', url: 'https://ex.com/a' }])
    expect(plan.deleteIds).toEqual([])
  })

  it('같은 유저·같은 canonical 중복 → 최신 1건 유지, 나머지 삭제', () => {
    const plan = planUrlBackfill([
      row('old', 'u1', 'https://ex.com/a', '2026-01-01'),
      row('new', 'u1', 'https://ex.com/a/?utm_source=x', '2026-02-01'),
    ])
    // 최신(new) 유지 — 이미 canonical 아니면 업데이트, old는 삭제
    expect(plan.deleteIds).toEqual(['old'])
    expect(plan.updates).toEqual([{ id: 'new', url: 'https://ex.com/a' }])
  })

  it('유지행이 이미 canonical이면 업데이트 없이 삭제만', () => {
    const plan = planUrlBackfill([
      row('keep', 'u1', 'https://ex.com/a', '2026-02-01'),
      row('dup', 'u1', 'https://ex.com/a/', '2026-01-01'),
    ])
    expect(plan.deleteIds).toEqual(['dup'])
    expect(plan.updates).toEqual([])
  })

  it('다른 유저의 동일 canonical은 서로 무관 (중복 아님)', () => {
    const plan = planUrlBackfill([
      row('1', 'u1', 'https://ex.com/a/', '2026-01-01'),
      row('2', 'u2', 'https://ex.com/a/', '2026-01-01'),
    ])
    expect(plan.deleteIds).toEqual([])
    expect(plan.updates).toEqual([
      { id: '1', url: 'https://ex.com/a' },
      { id: '2', url: 'https://ex.com/a' },
    ])
  })
})
