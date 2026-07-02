import { describe, it, expect, beforeEach } from 'vitest'
import { useFilterStore } from '@/store/filterStore'

// 카테고리 집계는 서버(extractCategories)로 이관 →
// app/api/bookmarks/categories/__tests__/route.test.ts 에서 검증.
// 여기서는 사이드바 탭 상태 전이만 검증.

describe('Sidebar 탭 — filterStore.setTab', () => {
  beforeEach(() => {
    // 각 테스트 전 tab을 초기값(all)으로 리셋
    useFilterStore.setState({ tab: 'all' })
  })

  it('초기 tab은 "all"', () => {
    expect(useFilterStore.getState().tab).toBe('all')
  })

  it('즐겨찾기 탭 클릭 시 setTab("favorites") → tab이 "favorites"로 변경', () => {
    useFilterStore.getState().setTab('favorites')
    expect(useFilterStore.getState().tab).toBe('favorites')
  })

  it('전체 탭 클릭 시 setTab("all") → tab이 "all"로 복원', () => {
    useFilterStore.getState().setTab('favorites')
    useFilterStore.getState().setTab('all')
    expect(useFilterStore.getState().tab).toBe('all')
  })
})
