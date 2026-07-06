"use client";

import { useCallback, useEffect, useMemo, useRef, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { useShallow } from "zustand/react/shallow";
import { AddBookmarkModal } from "@/components/AddBookmarkModal";
import { BookmarkCard } from "@/components/BookmarkCard";
import { BookmarkSkeleton } from "@/components/BookmarkSkeleton";
import { ExtensionSync } from "@/components/ExtensionSync";
import { SearchBar } from "@/components/SearchBar";
import { Sidebar } from "@/components/Sidebar";
import { BookmarkToolbar } from "@/components/BookmarkToolbar";
import { useBookmarks } from "@/hooks/useBookmarks";
import { useSearch } from "@/hooks/useSearch";
import { useFilterStore } from "@/store/filterStore";
import { createClient } from "@/lib/supabase/client";
import { getOnboardingKey, isOnboardingDone } from "@/lib/onboarding";
import { parseFilterQuery, buildFilterQuery } from "@/lib/filterQuery";
import { cn } from "@/lib/utils";

function DashboardContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    category,
    folder,
    tag,
    tab,
    sortOrder,
    viewMode,
    searchQuery,
    setCategory,
    setFolder,
    setTag,
    setTab,
    setSearchQuery,
  } = useFilterStore(
    useShallow((s) => ({
      category: s.category,
      folder: s.folder,
      tag: s.tag,
      tab: s.tab,
      sortOrder: s.sortOrder,
      viewMode: s.viewMode,
      searchQuery: s.searchQuery,
      setCategory: s.setCategory,
      setFolder: s.setFolder,
      setTag: s.setTag,
      setTab: s.setTab,
      setSearchQuery: s.setSearchQuery,
    })),
  );

  // 신규 유저 온보딩 리다이렉트 — localStorage 기반 최소 체크 (A26)
  // isOnboardingDone이 손상된 값도 안전 처리(크래시 방지)
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const stored = localStorage.getItem(getOnboardingKey(user.id));
      if (!isOnboardingDone(stored)) {
        router.push("/onboarding");
      }
    });
  }, [router]);

  // searchParams 객체는 네비게이션에서 참조가 유지될 수 있어 의존성으로 부적합.
  // 쿼리 문자열로 의존해야 내용 변경마다 effect가 재실행된다.
  const queryString = searchParams.toString();
  const fromExtension = searchParams.get("from") === "extension";

  // URL 쿼리 ↔ 필터 동기화. 싱글톤 스토어라 파라미터 없으면 null로 리셋해야
  // 이전 필터 잔류(active 표시 불일치)를 막는다. 쿼리 변경마다 재조정.
  useEffect(() => {
    const f = parseFilterQuery(queryString);
    setCategory(f.category);
    setFolder(f.folder);
    setTag(f.tag);
    setTab(f.tab);
  }, [queryString, setCategory, setFolder, setTag, setTab]);

  // 마운트 첫 실행은 건너뛰어 초기화 Effect와 레이스 방지
  const syncInitRef = useRef(false);
  useEffect(() => {
    if (!syncInitRef.current) {
      syncInitRef.current = true;
      return;
    }
    const qs = buildFilterQuery({ category, folder, tag, tab, fromExtension });
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [category, folder, tag, tab, router, pathname, fromExtension]);

  const isSearching = searchQuery.trim().length > 0;

  const {
    data: bookmarkData,
    isPending: isBookmarkPending,
    isFetching: isBookmarkFetching,
    isError: isBookmarkError,
    refetch,
  } = useBookmarks({
    category: category ?? undefined,
    folder: folder ?? undefined,
    tag: tag ?? undefined,
    // favorites만 명시 전달 — 다른 SidebarTab 값 누출 방지 (L-3)
    tab: tab === "favorites" ? "favorites" : undefined,
  });

  const { mutate: search, data: searchData, isPending: isSearchPending, isError: isSearchError } = useSearch();

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      search(query);
    },
    [search, setSearchQuery],
  );

  const handleClear = useCallback(() => setSearchQuery(""), [setSearchQuery]);

  const isPending = isSearching ? isSearchPending : isBookmarkPending;
  // keepPreviousData로 카테고리·폴더·태그 전환 시 isPending은 false로 유지된 채
  // 이전 목록이 그대로 보이는 동안 백그라운드 refetch만 진행됨 — 이 구간에서만 로딩 표시.
  const isRefetching = !isSearching && !isBookmarkPending && isBookmarkFetching;
  const items = useMemo(
    () => (isSearching ? (searchData?.results ?? []) : (bookmarkData?.bookmarks ?? [])),
    [isSearching, searchData, bookmarkData],
  );
  const allBookmarks = bookmarkData?.bookmarks ?? [];

  // 정렬: created_at 기준 최신/오래된. ponytail: 현재 페이지 한정 클라 정렬, 페이지네이션 도입 시 서버 order로
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) =>
      sortOrder === "latest" ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at),
    );
  }, [items, sortOrder]);

  return (
    <>
      {fromExtension && <ExtensionSync />}
      <Sidebar />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 px-4 py-8 overflow-y-auto">
        {/* 북마크가 하나도 없으면 검색 의미 없음 → 검색바 숨김 (검색 중에는 유지) */}
        {(allBookmarks.length > 0 || isSearching) && (
          <SearchBar onSearch={handleSearch} onClear={handleClear} value={searchQuery} onChange={setSearchQuery} />
        )}

        {isPending && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <BookmarkSkeleton key={i} />
            ))}
          </div>
        )}

        {!isPending && isBookmarkError && !isSearching && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-gray-500 dark:text-gray-400">북마크를 불러오는 중 오류가 발생했습니다.</p>
            <button
              onClick={() => refetch()}
              className="gradient-brand mt-3 rounded-[11px] px-4 py-2 text-sm text-white transition-transform hover:-translate-y-px"
            >
              다시 시도
            </button>
          </div>
        )}

        {!isPending && items.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
            {isSearching ? (
              isSearchError && !isSearchPending ? (
                // 검색 오류 시 empty 문구 없이 에러만 노출 (상호배타)
                <p className="text-sm text-red-500">검색 중 오류가 발생했습니다. 다시 시도해 주세요.</p>
              ) : (
                <>
                  <p className="text-lg font-medium text-gray-700 dark:text-gray-300">검색 결과가 없습니다</p>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">다른 검색어로 시도해 보세요.</p>
                </>
              )
            ) : tab === "favorites" ? (
              // 즐겨찾기 탭은 북마크는 있으나 즐겨찾기만 없는 상태 — 추가/업로드 CTA 부적절
              <>
                <p className="text-lg font-medium text-gray-700 dark:text-gray-300">즐겨찾기한 북마크가 없습니다</p>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  북마크 카드의 별표를 눌러 즐겨찾기에 추가하세요.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-medium text-gray-700 dark:text-gray-300">저장된 북마크가 없습니다</p>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  북마크를 추가하거나 파일을 업로드해 시작하세요.
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <AddBookmarkModal />
                  <Link
                    href="/import"
                    className="rounded-[11px] border border-blue-200 bg-[#EFF6FF] px-4 py-2 text-sm font-medium text-brand transition-colors hover:bg-[#DBEAFE] dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-300"
                  >
                    파일 업로드
                  </Link>
                </div>
              </>
            )}
          </div>
        )}

        {!isPending && items.length > 0 && (
          <>
            <BookmarkToolbar />
            <div className="relative">
              {isRefetching && (
                <div
                  role="status"
                  aria-label="목록 갱신 중"
                  className="absolute right-0 top-0 z-10 flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/90 px-2.5 py-1 text-xs text-gray-500 shadow-sm backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/90 dark:text-gray-400"
                >
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-brand dark:border-gray-600" />
                  불러오는 중
                </div>
              )}
              <div
                className={cn(
                  viewMode === "grid"
                    ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                    : viewMode === "compact"
                      ? "flex flex-col divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-700 dark:bg-gray-900"
                      : "flex flex-col gap-3",
                  isRefetching && "opacity-50 transition-opacity duration-200",
                )}
              >
                {sortedItems.map((item) => (
                  <BookmarkCard key={item.id} bookmark={item} view={viewMode} />
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}

function DashboardFallback() {
  return (
    <>
      <div className="w-52 shrink-0" />
      <div className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <BookmarkSkeleton key={i} />
        ))}
      </div>
    </>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardContent />
    </Suspense>
  );
}
