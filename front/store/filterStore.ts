import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow' // v5 import 경로

type SidebarTab = 'all' | 'favorites' | 'categories' | 'folders'
type SortOrder = 'latest' | 'oldest'
type ViewMode = 'list' | 'grid'

interface FilterState {
  tab: SidebarTab
  category: string | null
  folder: string | null
  tag: string | null
  searchQuery: string
  sortOrder: SortOrder
  viewMode: ViewMode
  setTab: (tab: SidebarTab) => void
  setCategory: (category: string | null) => void
  setFolder: (folder: string | null) => void
  setTag: (tag: string | null) => void
  setSearchQuery: (query: string) => void
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
