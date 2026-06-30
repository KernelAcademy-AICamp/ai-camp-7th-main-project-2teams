import { isDefaultFolder } from './parseNetscapeBookmarks'

export interface FolderNode {
  name: string // 현재 depth 폴더명
  path: string[] // 루트부터 현재까지 전체 경로
  children: FolderNode[]
}

/** 폴더 경로 목록 → 트리. 빈 세그먼트 제외, 같은 부모 내 이름순 정렬 */
export function buildFolderTree(paths: string[][]): FolderNode[] {
  const roots: FolderNode[] = []
  for (const path of paths) {
    let level = roots
    const acc: string[] = []
    for (const seg of path) {
      // 빈 세그먼트·크롬 기본 폴더 스킵 (기존 저장 데이터 방어)
      if (!seg || isDefaultFolder(seg)) continue
      acc.push(seg)
      let node = level.find((n) => n.name === seg)
      if (!node) {
        node = { name: seg, path: [...acc], children: [] }
        level.push(node)
      }
      level = node.children
    }
  }
  sortTree(roots)
  return roots
}

function sortTree(nodes: FolderNode[]) {
  nodes.sort((a, b) => a.name.localeCompare(b.name))
  for (const n of nodes) sortTree(n.children)
}
