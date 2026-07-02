// retag 자동 백업 스냅샷 직렬화/파싱 — 순수 함수(무부작용, 테스트 대상).
// scripts/retag.ts B-1 백업이 사용. docs/specs/tag-eval-redesign.md §B-1.

export type TagSnapshot = { id: string; tags: string[] }

export function serializeBackup(rows: TagSnapshot[]): string {
  return JSON.stringify(rows, null, 0)
}

// 파싱 시 형식 검증 — 손상/오형식 백업으로 복원 시도 방지.
export function parseBackup(json: string): TagSnapshot[] {
  const data = JSON.parse(json)
  if (!Array.isArray(data)) throw new Error('백업 형식 오류: 배열 아님')
  return data.map((r) => {
    if (typeof r?.id !== 'string' || !Array.isArray(r?.tags)) {
      throw new Error('백업 형식 오류: {id, tags} 아님')
    }
    return { id: r.id, tags: r.tags as string[] }
  })
}
