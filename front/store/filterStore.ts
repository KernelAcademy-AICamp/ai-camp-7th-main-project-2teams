import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow' // v5 import 경로

type SidebarTab = 'all' | 'favorites' | 'categories' | 'folders'
type SortOrder = 'latest' | 'oldest'
type ViewMode = 'list' | 'grid' | 'compact'

interface FilterState {
  tab: SidebarTab
  category: string | null
  /** 폴더 필터 — 루트부터 선택 노드까지 전체 경로(동명이인 폴더 구분용). 미선택 시 null */
  folder: string[] | null
  tag: string | null
  /** 확정된 검색어 — submit(검색 버튼·Enter) 시에만 갱신. 결과 목록 전환(isSearching)의 기준 */
  searchQuery: string
  /** 입력 중인 텍스트 — 매 타이핑 갱신. searchQuery와 분리해야 타이핑만으로 목록이 바뀌지 않는다 */
  searchInput: string
  sortOrder: SortOrder
  viewMode: ViewMode
  setTab: (tab: SidebarTab) => void
  setCategory: (category: string | null) => void
  setFolder: (folder: string[] | null) => void
  setTag: (tag: string | null) => void
  setSearchQuery: (query: string) => void
  setSearchInput: (value: string) => void
  /** 입력·확정 검색어를 함께 해제. 사이드바 필터 전환처럼 검색을 끝내는 경로에서 쓴다 */
  clearSearch: () => void
  setSortOrder: (order: SortOrder) => void
  setViewMode: (mode: ViewMode) => void
  reset: () => void
}

const initialState = {
  tab: 'all' as SidebarTab,
  category: null,
  folder: null,
  tag: null,
  searchQuery: '',
  searchInput: '',
  sortOrder: 'latest' as SortOrder,
  viewMode: 'grid' as ViewMode, // 기본 그리드 (기존 화면 유지)
}

export const useFilterStore = create<FilterState>((set) => ({
  ...initialState,
  setTab: (tab) => set({ tab }),
  setCategory: (category) => set({ category }),
  setFolder: (folder) => set({ folder }),
  setTag: (tag) => set({ tag }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSearchInput: (searchInput) => set({ searchInput }),
  clearSearch: () => set({ searchQuery: '', searchInput: '' }),
  setSortOrder: (sortOrder) => set({ sortOrder }),
  setViewMode: (viewMode) => set({ viewMode }),
  reset: () => set(initialState),
}))

// 여러 값 동시 구독 시 useShallow로 불필요한 리렌더 방지
export function useFilters() {
  return useFilterStore(
    useShallow((s) => ({ category: s.category, folder: s.folder, tag: s.tag }))
  )
}
