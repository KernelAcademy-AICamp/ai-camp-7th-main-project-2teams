import { describe, it, expect } from 'vitest'
import { buildFolderTree } from '../folderTree'

describe('buildFolderTree — 경로 목록 → 트리', () => {
  it('공통 부모를 병합하고 자식을 정렬한다', () => {
    const tree = buildFolderTree([
      ['개발', '프론트엔드'],
      ['개발', '백엔드'],
      ['디자인'],
    ])
    expect(tree.map((n) => n.name)).toEqual(['개발', '디자인'])
    const dev = tree[0]
    expect(dev.children.map((n) => n.name)).toEqual(['백엔드', '프론트엔드'])
    expect(dev.children[1].path).toEqual(['개발', '프론트엔드'])
  })

  it('빈 세그먼트를 건너뛴다', () => {
    const tree = buildFolderTree([['', '하위'], ['개발']])
    expect(tree.map((n) => n.name).sort()).toEqual(['개발', '하위'])
  })

  it('3 depth 중첩을 구성한다', () => {
    const tree = buildFolderTree([['개발', '프론트엔드', 'React']])
    expect(tree[0].children[0].children[0].name).toBe('React')
    expect(tree[0].children[0].children[0].path).toEqual(['개발', '프론트엔드', 'React'])
  })

  it('빈 입력이면 빈 배열', () => {
    expect(buildFolderTree([])).toEqual([])
  })

  it('크롬 기본 폴더(북마크바·기타 북마크 등)는 제외한다', () => {
    const tree = buildFolderTree([
      ['북마크바', '개발'],
      ['기타 북마크', '참고'],
      ['Bookmarks Bar', '디자인'],
    ])
    expect(tree.map((n) => n.name).sort()).toEqual(['개발', '디자인', '참고'])
  })
})
