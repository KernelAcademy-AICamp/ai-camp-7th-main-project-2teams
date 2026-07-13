"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { ArrowUp, Menu } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { AddBookmarkModal } from "@/components/AddBookmarkModal";
import { BookmarkCard } from "@/components/BookmarkCard";
import { BookmarkSkeleton } from "@/components/BookmarkSkeleton";
import { ExtensionSync } from "@/components/ExtensionSync";
import { SearchBar } from "@/components/SearchBar";
import { Sidebar } from "@/components/Sidebar";
import { BookmarkToolbar } from "@/components/BookmarkToolbar";
import { InfiniteScrollTrigger } from "@/components/InfiniteScrollTrigger";
import { useBookmarks } from "@/hooks/useBookmarks";
import { useSearch } from "@/hooks/useSearch";
import { useFilterStore } from "@/store/filterStore";
import { useUserStore } from "@/store/userStore";
import { getOnboardingKey, isOnboardingDone } from "@/lib/onboarding";
import { parseFilterQuery, buildFilterQuery } from "@/lib/filterQuery";
import { cn } from "@/lib/utils";

function DashboardContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const mainRef = useRef<HTMLElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

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

  const fetchUser = useUserStore((s) => s.fetchUser);

  // 신규 유저 온보딩 리다이렉트 — localStorage 기반 최소 체크 (A26)
  // isOnboardingDone이 손상된 값도 안전 처리(크래시 방지)
  // fetchUser는 zustand 스토어에서 캐시/inflight 공유 — Sidebar와 중복 호출되지 않음
  useEffect(() => {
    fetchUser().then((user) => {
      if (!user) return;
      const stored = localStorage.getItem(getOnboardingKey(user.id));
      if (!isOnboardingDone(stored)) {
        router.push("/onboarding");
      }
    });
  }, [fetchUser, router]);

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

  // 카테고리 변경 시 이전 스크롤 위치 잔류 방지 — 목록 최상단으로 리셋
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [category]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    setShowScrollTop(e.currentTarget.scrollTop > 400);
  }, []);

  const scrollToTop = useCallback(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const isSearching = searchQuery.trim().length > 0;

  const {
    data: bookmarkData,
    isPending: isBookmarkPending,
    isFetching: isBookmarkFetching,
    isError: isBookmarkError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useBookmarks({
    category: category ?? undefined,
    folder: folder ?? undefined,
    tag: tag ?? undefined,
    // favorites만 명시 전달 — 다른 SidebarTab 값 누출 방지 (L-3)
    tab: tab === "favorites" ? "favorites" : undefined,
  });

  const {
    mutate: search,
    isPending: isSearchPending,
    isError: isSearchError,
    visibleResults: searchVisibleResults,
    hasMore: searchHasMore,
    showMore: searchShowMore,
    total: searchTotal,
  } = useSearch();

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      // A58: 사이드바 태그/즐겨찾기 필터가 걸린 상태에서 검색해도 그대로 유지되도록 전달.
      search({
        query,
        category: category ?? undefined,
        tag: tag ?? undefined,
        is_favorite: tab === "favorites" ? true : undefined,
      });
    },
    [search, setSearchQuery, category, tag, tab],
  );

  const handleClear = useCallback(() => setSearchQuery(""), [setSearchQuery]);

  // A62: 검색은 클라이언트 슬라이스(showMore)라 재호출 없음, 목록은 서버 재호출(fetchNextPage).
  const handleLoadMore = useCallback(() => {
    if (isSearching) {
      searchShowMore();
    } else {
      fetchNextPage();
    }
  }, [isSearching, searchShowMore, fetchNextPage]);

  const loadMoreDisabled = isSearching ? !searchHasMore : !hasNextPage || isFetchingNextPage;

  const isPending = isSearching ? isSearchPending : isBookmarkPending;
  // keepPreviousData로 카테고리·폴더·태그 전환 시 isPending은 false로 유지된 채
  // 이전 목록이 그대로 보이는 동안 백그라운드 refetch만 진행됨 — 이 구간에서만 로딩 표시.
  // isFetchingNextPage(다음 페이지 로드)는 별도 하단 스피너로 표시하므로 여기서 제외.
  const isRefetching = !isSearching && !isBookmarkPending && isBookmarkFetching && !isFetchingNextPage;
  const allBookmarks = useMemo(() => bookmarkData?.pages.flatMap((p) => p.bookmarks) ?? [], [bookmarkData]);
  const totalCount = bookmarkData?.pages[0]?.total;
  const items = useMemo(
    () => (isSearching ? searchVisibleResults : allBookmarks),
    [isSearching, searchVisibleResults, allBookmarks],
  );

  // 정렬: created_at 기준 최신/오래된. ponytail: 현재 페이지 한정 클라 정렬, 페이지네이션 도입 시 서버 order로
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) =>
      sortOrder === "latest" ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at),
    );
  }, [items, sortOrder]);

  return (
    <>
      {fromExtension && <ExtensionSync />}
      <Sidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />

      <main
        ref={mainRef}
        onScroll={handleScroll}
        className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-4 px-4 pt-8 pb-24 overflow-y-auto"
      >
        {/* 모바일 전용 필터 열기 버튼 — md 이상에서는 사이드바가 항상 노출되므로 숨김 */}
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(true)}
          aria-label="필터 열기"
          className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary md:hidden"
        >
          <Menu size={16} />
          필터
        </button>

        {showScrollTop && (
          <button
            type="button"
            onClick={scrollToTop}
            aria-label="맨 위로 이동"
            className="gradient-brand fixed bottom-6 right-6 z-20 flex h-10 w-10 items-center justify-center rounded-md text-white shadow-lg transition-transform hover:-translate-y-0.5"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
        <SearchBar
          onSearch={handleSearch}
          onClear={handleClear}
          value={searchQuery}
          onChange={setSearchQuery}
          isLoading={isSearching && isSearchPending}
          resultCount={isSearching && !isSearchPending ? searchTotal : undefined}
        />

        {isPending && (
          <div
            className={cn(
              viewMode === "grid"
                ? "grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5"
                : viewMode === "compact"
                  ? "flex flex-col divide-y divide-gray-100 overflow-hidden rounded-md border border-gray-200 bg-white"
                  : "flex flex-col gap-3",
            )}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <BookmarkSkeleton key={i} view={viewMode} />
            ))}
          </div>
        )}

        {!isPending && isBookmarkError && !isSearching && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-gray-500">북마크를 불러오는 중 오류가 발생했습니다.</p>
            <button
              onClick={() => refetch()}
              className="gradient-brand mt-3 cursor-pointer rounded-[11px] px-4 py-2 text-sm text-white transition-transform hover:-translate-y-px"
            >
              다시 시도
            </button>
          </div>
        )}

        {!isPending && !isBookmarkError && items.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
            {isSearching ? (
              isSearchError && !isSearchPending ? (
                // 검색 오류 시 empty 문구 없이 에러만 노출 (상호배타)
                <p className="text-sm text-red-500">검색 중 오류가 발생했습니다. 다시 시도해 주세요.</p>
              ) : (
                <>
                  <p className="text-lg font-medium text-gray-700">검색 결과가 없습니다</p>
                  <p className="mt-2 text-sm text-gray-500">다른 검색어로 시도해 보세요.</p>
                </>
              )
            ) : tab === "favorites" ? (
              // 즐겨찾기 탭은 북마크는 있으나 즐겨찾기만 없는 상태 — 추가/업로드 CTA 부적절
              <>
                <p className="text-lg font-medium text-gray-700">즐겨찾기한 북마크가 없습니다</p>
                <p className="mt-2 text-sm text-gray-500">
                  북마크 카드의 별표를 눌러 즐겨찾기에 추가하세요.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-medium text-gray-700">저장된 북마크가 없습니다</p>
                <p className="mt-2 text-sm text-gray-500">
                  북마크를 추가하거나 파일을 업로드해 시작하세요.
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <AddBookmarkModal />
                  <Link
                    href="/import"
                    className="rounded-[11px] border border-blue-200 bg-[#EFF6FF] px-4 py-2 text-sm font-medium text-brand transition-colors hover:bg-[#DBEAFE]"
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
            <div className="flex items-center justify-between">
              {!isSearching && typeof totalCount === "number" ? (
                <p className="text-sm text-text-secondary">총 {totalCount}개</p>
              ) : (
                <span />
              )}
              <BookmarkToolbar />
            </div>
            <div className="relative">
              {isRefetching && (
                <div
                  role="status"
                  aria-label="목록 갱신 중"
                  className="absolute right-0 top-0 z-10 flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/90 px-2.5 py-1 text-xs text-gray-500 shadow-sm backdrop-blur-sm"
                >
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-brand" />
                  불러오는 중
                </div>
              )}
              {/* 뷰 전환 시 리마운트하지 않음 — 순차 fade-in(animate-rise)은 최초 로드에만 재생, 뷰 전환은 즉시 리레이아웃 */}
              <div
                className={cn(
                  viewMode === "grid"
                    ? "grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5"
                    : viewMode === "compact"
                      ? "flex flex-col divide-y divide-gray-100 overflow-hidden rounded-md border border-gray-200 bg-white"
                      : "flex flex-col gap-3",
                  isRefetching && "opacity-50 transition-opacity duration-200",
                )}
              >
                {sortedItems.map((item, i) => (
                  <div
                    key={item.id}
                    className="animate-rise opacity-0"
                    style={{ animationDelay: `${Math.min(i * 25, 300)}ms` }}
                  >
                    <BookmarkCard bookmark={item} view={viewMode} />
                  </div>
                ))}
                <InfiniteScrollTrigger onIntersect={handleLoadMore} disabled={loadMoreDisabled} />
              </div>
            </div>

            {/* 목록 다음 페이지 로딩 — 검색은 네트워크 호출이 없어 스피너 불필요 */}
            {!isSearching && isFetchingNextPage && (
              <div
                role="status"
                className="flex items-center justify-center gap-2 py-4 text-xs text-gray-500"
              >
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-brand" />
                더 불러오는 중
              </div>
            )}

            {/* 목록 다음 페이지 실패 — 전체 화면 에러와 구분되는 하단 소형 에러, 이미 로드된 목록은 유지 */}
            {!isSearching && isFetchNextPageError && (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <p className="text-sm text-red-500">더 불러오지 못했습니다.</p>
                <button
                  onClick={() => fetchNextPage()}
                  className="cursor-pointer rounded-[11px] border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50"
                >
                  다시 시도
                </button>
              </div>
            )}
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
      <div className="grid flex-1 grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
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
