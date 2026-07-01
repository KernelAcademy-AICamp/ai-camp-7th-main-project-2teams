// 기존 북마크 URL 정규화 백필 계획 — 순수 함수(I/O 없음).
// 스크립트(scripts/backfill-normalize-url.ts)가 DB 행을 읽어 이 함수로 변경 계획을 산출한다.
import { normalizeUrl } from './normalizeUrl'

export interface BackfillRow {
  id: string
  user_id: string
  url: string
  created_at: string // ISO — 그룹 내 최신 유지 판단
}

export interface BackfillPlan {
  updates: { id: string; url: string }[] // 유지 행의 url을 canonical로 교체
  deleteIds: string[] // (user_id, canonical) 중복 행 중 최신 제외 삭제
}

// (user_id, canonical URL) 그룹에서 최신 1건 유지, 나머지 삭제.
// 유지 행이 비정규 URL이면 canonical로 업데이트 대상에 포함.
export function planUrlBackfill(rows: BackfillRow[]): BackfillPlan {
  const groups = new Map<string, BackfillRow[]>()
  for (const r of rows) {
    const key = `${r.user_id}\n${normalizeUrl(r.url)}`
    const g = groups.get(key)
    if (g) g.push(r)
    else groups.set(key, [r])
  }

  const updates: { id: string; url: string }[] = []
  const deleteIds: string[] = []

  for (const [key, g] of groups) {
    const canonical = key.slice(key.indexOf('\n') + 1)
    // 최신(created_at DESC) 1건 유지 — 삭제 전 unique 충돌 방지 위해 나머지 먼저 삭제
    const sorted = [...g].sort((a, b) => b.created_at.localeCompare(a.created_at))
    const keep = sorted[0]
    for (const dup of sorted.slice(1)) deleteIds.push(dup.id)
    if (keep.url !== canonical) updates.push({ id: keep.id, url: canonical })
  }

  return { updates, deleteIds }
}
