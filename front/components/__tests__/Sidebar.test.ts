import { describe, it, expect } from 'vitest'
import { aggregateTags } from '../Sidebar'
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
