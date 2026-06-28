import { describe, it, expect, beforeEach } from 'vitest'
import { aggregateTags } from '../Sidebar'
import { useFilterStore } from '@/store/filterStore'
import type { Bookmark } from '@/hooks/useBookmarks'

const makeBookmark = (tags: string[]): Bookmark => ({
  id: crypto.randomUUID(),
  title: 'test',
  url: 'https://example.com',
  tags,
  category_id: null,
  is_favorite: false,
  folder_hint: null,
  created_at: new Date().toISOString(),
})

describe('aggregateTags', () => {
  it('빈 배열 → 빈 결과', () => {
    expect(aggregateTags([])).toEqual([])
  })

  it('단일 북마크 태그 반환', () => {
    const result = aggregateTags([makeBookmark(['React', 'TypeScript'])])
    expect(result).toContain('React')
    expect(result).toContain('TypeScript')
  })

  it('빈도 높은 태그 우선 정렬', () => {
    const bookmarks = [
      makeBookmark(['React']),
      makeBookmark(['React', 'Next.js']),
      makeBookmark(['Next.js', 'Next.js']),
    ]
    const result = aggregateTags(bookmarks)
    // Next.js 3회, React 2회 → Next.js 먼저
    expect(result[0]).toBe('Next.js')
    expect(result[1]).toBe('React')
  })

  it('limit 적용', () => {
    const bookmarks = Array.from({ length: 30 }, (_, i) => makeBookmark([`tag-${i}`]))
    expect(aggregateTags(bookmarks, 10)).toHaveLength(10)
  })
})

// --- (4) 즐겨찾기 탭 setTab 동작 검증 ---
describe('Sidebar 탭 — filterStore.setTab', () => {
  beforeEach(() => {
    // 각 테스트 전 tab을 초기값(all)으로 리셋
    useFilterStore.setState({ tab: 'all' })
  })

  it('초기 tab은 "all"', () => {
    expect(useFilterStore.getState().tab).toBe('all')
  })

  it('즐겨찾기 탭 클릭 시 setTab("favorites") → tab이 "favorites"로 변경', () => {
    // Sidebar의 즐겨찾기 탭 onClick 핸들러 시뮬레이션
    useFilterStore.getState().setTab('favorites')

    expect(useFilterStore.getState().tab).toBe('favorites')
  })

  it('전체 탭 클릭 시 setTab("all") → tab이 "all"로 복원', () => {
    // 먼저 favorites로 변경 후 다시 all로
    useFilterStore.getState().setTab('favorites')
    useFilterStore.getState().setTab('all')

    expect(useFilterStore.getState().tab).toBe('all')
  })
})
