// URL 쿼리 ↔ 필터 상태 매핑 (단일 출처).
// 대시보드의 양방향 동기화 effect가 이 순수 함수를 사용한다.

export interface ParsedFilter {
  category: string | null
  /** 루트부터 선택 노드까지 전체 경로. URL에는 '/'로 조인된 단일 파라미터로 저장(폴더명에 '/' 없다고 전제) */
  folder: string[] | null
  tag: string | null
  tab: 'all' | 'favorites' | 'folders'
}

// 쿼리 문자열 → 필터 상태. 파라미터가 없으면 null/'all'로 리셋되어야
// 이전 필터 잔류(active 표시 불일치)를 막는다.
export function parseFilterQuery(queryString: string): ParsedFilter {
  const p = new URLSearchParams(queryString)
  const folderParam = p.get('folder')
  return {
    category: p.get('category'),
    folder: folderParam ? folderParam.split('/') : null,
    tag: p.get('tag'),
    tab: p.get('tab') === 'favorites' ? 'favorites' : p.get('tab') === 'folders' ? 'folders' : 'all',
  }
}

// 필터 상태 → 쿼리 문자열. 빈 값은 생략해 stale 파라미터를 남기지 않는다.
// favorites·folders 탭만 URL에 반영, 익스텐션 진입 플래그(from)는 보존.
export function buildFilterQuery(state: {
  category: string | null
  folder: string[] | null
  tag: string | null
  tab: string
  fromExtension?: boolean
}): string {
  const params = new URLSearchParams()
  if (state.category) params.set('category', state.category)
  if (state.folder && state.folder.length > 0) params.set('folder', state.folder.join('/'))
  if (state.tag) params.set('tag', state.tag)
  if (state.tab === 'favorites' || state.tab === 'folders') params.set('tab', state.tab)
  if (state.fromExtension) params.set('from', 'extension')
  return params.toString()
}
