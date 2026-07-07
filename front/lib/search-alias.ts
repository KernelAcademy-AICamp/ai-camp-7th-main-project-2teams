// 브랜드/툴명 음차 사전 — 검색 쿼리 확장용. 운영 중 누락 발견 시 추가.
// text-embedding-3-small이 음차 표기(피그마)와 원어(Figma)를 교차언어로 강하게 연결 못 함
// (실측 cos_sim 0.09~0.44, 대부분 relevance floor 미달) — 쿼리를 원어까지 확장해 검색한다.
export const SEARCH_ALIAS: Record<string, string> = {
  피그마: 'Figma',
  유튜브: 'YouTube',
  노션: 'Notion',
  슬랙: 'Slack',
  깃허브: 'GitHub',
  지라: 'Jira',
  피피티: 'PowerPoint',
  포토샵: 'Photoshop',
  일러스트: 'Illustrator',
  스프레드시트: 'Spreadsheet',
}

export function expandSearchQuery(query: string): string[] {
  const trimmed = query.trim()
  const direct = SEARCH_ALIAS[trimmed]
  if (direct) return [trimmed, direct]

  const reverseEntry = Object.entries(SEARCH_ALIAS).find(
    ([, en]) => en.toLowerCase() === trimmed.toLowerCase(),
  )
  if (reverseEntry) return [trimmed, reverseEntry[0]]

  return [trimmed]
}
