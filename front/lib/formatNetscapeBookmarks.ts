export interface ExportBookmark {
  title: string
  url: string
  /** 중·소분류 (대분류 제외 — bookmarks.tags 컬럼과 동일 정제 상태) */
  tags: string[]
  /** 대분류명 (TOP_CATEGORIES 중 하나) — 미분류는 null */
  category_name: string | null
  folder_hint: string[] | null
}

interface FolderNode {
  bookmarks: ExportBookmark[]
  children: Map<string, FolderNode>
}

const HEADER = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
`

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildTree(bookmarks: ExportBookmark[]): FolderNode {
  const root: FolderNode = { bookmarks: [], children: new Map() }
  for (const bm of bookmarks) {
    let node = root
    for (const folder of bm.folder_hint ?? []) {
      let child = node.children.get(folder)
      if (!child) {
        child = { bookmarks: [], children: new Map() }
        node.children.set(folder, child)
      }
      node = child
    }
    node.bookmarks.push(bm)
  }
  return root
}

// TAGS는 Firefox 내보내기도 쓰는 준표준 속성 — 표준 브라우저는 무시, 우리 서비스는 재임포트 시 복원.
// DATA_CATEGORY는 완전 비표준(대분류 전용) — 동일하게 재임포트 복원 목적.
function renderNode(node: FolderNode, depth: number): string {
  const indent = '    '.repeat(depth)
  const lines: string[] = []

  for (const bm of node.bookmarks) {
    const attrs = [`HREF="${escapeHtml(bm.url)}"`]
    if (bm.tags.length > 0) attrs.push(`TAGS="${escapeHtml(bm.tags.join(','))}"`)
    if (bm.category_name) attrs.push(`DATA_CATEGORY="${escapeHtml(bm.category_name)}"`)
    lines.push(`${indent}<DT><A ${attrs.join(' ')}>${escapeHtml(bm.title)}</A>`)
  }

  for (const [name, child] of node.children) {
    lines.push(`${indent}<DT><H3>${escapeHtml(name)}</H3>`)
    lines.push(`${indent}<DL><p>`)
    lines.push(renderNode(child, depth + 1))
    lines.push(`${indent}</DL><p>`)
  }

  return lines.join('\n')
}

/** 북마크 목록을 Netscape 북마크 포맷 HTML로 변환. 브라우저 가져오기 + 자체 재임포트 양쪽 호환. */
export function formatNetscapeBookmarks(bookmarks: ExportBookmark[]): string {
  const tree = buildTree(bookmarks)
  return `${HEADER}<DL><p>\n${renderNode(tree, 1)}\n</DL><p>\n`
}
