"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { useFilterStore } from "@/store/filterStore";
import { useFolders } from "@/hooks/useFolders";
import { buildFolderTree, type FolderNode } from "@/lib/folderTree";
import { resolveTopCategory, UNCATEGORIZED_LABEL } from "@/lib/tag-alias";
import { SidebarSkeleton } from "@/components/SidebarSkeleton";
import { createClient } from "@/lib/supabase/client";
import type { Bookmark } from "@/hooks/useBookmarks";

export function aggregateTags(bookmarks: Bookmark[], limit = 20): string[] {
  const counts: Record<string, number> = {};
  for (const b of bookmarks) {
    for (const t of b.tags) counts[t] = (counts[t] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);
}

// 고정 대분류만 노출, 그 외(미상위·tags=[])는 "미분류" 한 항목으로 묶음(맨 뒤)
export function aggregateCategories(bookmarks: Bookmark[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  let hasUncategorized = false;
  for (const b of bookmarks) {
    const top = resolveTopCategory(b.tags);
    if (top) {
      if (!seen.has(top)) {
        seen.add(top);
        result.push(top);
      }
    } else {
      hasUncategorized = true;
    }
  }
  if (hasUncategorized) result.push(UNCATEGORIZED_LABEL);
  return result;
}

interface SidebarProps {
  bookmarks: Bookmark[];
  loading?: boolean;
}

export function Sidebar({ bookmarks, loading = false }: SidebarProps) {
  const [categoryOpen, setCategoryOpen] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const { category, folder, tab, setCategory, setFolder, setTag, setTab, setSearchQuery } = useFilterStore(
    useShallow((s) => ({
      category: s.category,
      folder: s.folder,
      tab: s.tab,
      setCategory: s.setCategory,
      setFolder: s.setFolder,
      setTag: s.setTag,
      setTab: s.setTab,
      setSearchQuery: s.setSearchQuery,
    })),
  );

  const { data: foldersData, isPending: foldersPending } = useFolders();
  const folders = useMemo(() => foldersData?.folders ?? [], [foldersData]);
  const folderTree = useMemo(() => buildFolderTree(foldersData?.paths ?? []), [foldersData]);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => setEmail(user?.email ?? null));
  }, []);

  // 팝업 외부 클릭 시 닫기
  useEffect(() => {
    if (!popupOpen) return;
    const handler = (e: MouseEvent) => {
      if (!popupRef.current?.contains(e.target as Node)) setPopupOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popupOpen]);

  const handleSignOut = async () => {
    await createClient().auth.signOut();
    router.push("/welcome");
  };

  // 유저 북마크에서 카테고리 동적 추출 (tags[0] = AI가 설정한 대분류)
  // 즐겨찾기 탭에서는 즐겨찾기 북마크 기준으로만 추출 (없는 카테고리 노출 방지)
  const categories = useMemo(() => {
    const source = tab === "favorites" ? bookmarks.filter((b) => b.is_favorite) : bookmarks;
    return aggregateCategories(source);
  }, [bookmarks, tab]);

  // folder_hint 있을 때만 "내 폴더" 탭 포함
  const topTabs = useMemo(() => {
    const base: Array<{ id: "all" | "favorites" | "folders"; label: string }> = [
      { id: "all", label: "홈" },
      { id: "favorites", label: "즐겨찾기" },
    ];
    if (folders.length > 0) base.push({ id: "folders", label: "내 폴더" });
    return base;
  }, [folders]);

  const handleTabClick = (t: "all" | "favorites" | "folders") => {
    setTab(t);
    setCategory(null);
    setTag(null);
    setFolder(t === "folders" ? (folders[0] ?? null) : null);
    setSearchQuery("");
  };

  const handleAll = () => {
    setCategory(null);
    setTag(null);
    setFolder(null);
    // 탭 유지 — 홈 전체·즐겨찾기 전체 각각 독립 동작
  };

  const handleCategory = (name: string) => {
    if (category === name) return;
    setCategory(name);
    setTag(null);
    setFolder(null);
  };

  const handleFolder = (name: string) => {
    if (folder === name) return;
    setFolder(name);
    setCategory(null);
    setTag(null);
  };

  const isAllActive = category === null && folder === null;

  // 탭별 축 분리: 내 폴더 탭은 폴더만, 그 외(홈·즐겨찾기)는 카테고리만 노출
  const showFolders = tab === "folders";
  // 폴더 탭은 폴더 쿼리, 그 외는 북마크(카테고리) 로딩 기준
  const showSkeleton = showFolders ? foldersPending : loading;

  return (
    <nav aria-label="북마크 필터" className="flex max-h-full w-48 shrink-0 flex-col gap-6 self-stretch overflow-y-auto">
      {/* 상단 탭 — 홈 / 즐겨찾기 / 내 폴더(폴더 있을 때만) */}
      <section>
        <div className="flex gap-0.5 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
          {topTabs.map((t) => (
            <button
              key={t.id}
              aria-pressed={tab === t.id}
              onClick={() => handleTabClick(t.id)}
              className={[
                "flex-1 rounded-md px-1.5 py-1 text-xs font-medium transition-colors",
                tab === t.id
                  ? "bg-white text-gray-900 shadow dark:bg-gray-700 dark:text-gray-100"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {/* 카테고리 + 폴더 통합 리스트 (접기/펼치기) */}
      <section className="overflow-y-auto">
        <button
          onClick={() => setCategoryOpen((o) => !o)}
          className="mb-2 flex w-full items-center justify-between"
          aria-expanded={categoryOpen}
        >
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            {showFolders ? "폴더" : "카테고리"}
          </h2>
          <span
            className={[
              "text-xs text-gray-400 transition-transform duration-200",
              categoryOpen ? "rotate-0" : "-rotate-90",
            ].join(" ")}
          >
            ▾
          </span>
        </button>

        {categoryOpen && showSkeleton && <SidebarSkeleton />}

        {categoryOpen && !showSkeleton && (
          <ul className="flex flex-col gap-0.5">
            {/* 전체 — 카테고리 필터 없음. 내 폴더 탭에서는 숨김 */}
            {!showFolders && (
              <li>
                <button
                  onClick={handleAll}
                  aria-pressed={isAllActive}
                  className={[
                    "w-full rounded-md px-3 py-1.5 text-left text-sm font-medium transition-colors",
                    isAllActive
                      ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                      : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800",
                  ].join(" ")}
                >
                  전체
                </button>
              </li>
            )}

            {/* 유저 카테고리 — 홈·즐겨찾기 탭 */}
            {!showFolders &&
              categories.map((name) => (
                <li key={`cat-${name}`}>
                  <button
                    onClick={() => handleCategory(name)}
                    aria-pressed={category === name}
                    className={[
                      "flex w-full items-center gap-1 rounded-md px-3 py-1.5 text-left text-sm transition-colors",
                      category === name
                        ? "bg-indigo-100 font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                        : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800",
                    ].join(" ")}
                  >
                    <span className="text-gray-400">›</span>
                    {name}
                  </button>
                </li>
              ))}

            {/* 폴더 트리 — 내 폴더 탭 (folder_hint 경로 계층 노출) */}
            {showFolders &&
              folderTree.map((node) => (
                <FolderTreeItem
                  key={node.path.join("/")}
                  node={node}
                  depth={0}
                  selected={folder}
                  onSelect={handleFolder}
                />
              ))}
          </ul>
        )}
      </section>

      {/* 유저 프로필 — 사이드바 최하단 */}
      <div ref={popupRef} className="relative mt-auto">
        {/* 팝업 — 프로필 행 위에 표시 */}
        {popupOpen && (
          <div className="absolute bottom-0 left-full ml-2 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
            <p className="px-3 py-1.5 text-xs text-gray-400">프로필 팝업 항목</p>
            <ul className="flex flex-col">
              <li>
                <Link
                  href="/profile"
                  onClick={() => setPopupOpen(false)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <span className="text-gray-400">›</span>
                  프로필 정보
                </Link>
              </li>
              <li>
                <Link
                  href="/settings"
                  onClick={() => setPopupOpen(false)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <span className="text-gray-400">›</span>
                  설정
                </Link>
              </li>
              <li>
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-1.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <span className="text-gray-400">›</span>
                  로그아웃
                </button>
              </li>
            </ul>
          </div>
        )}

        {/* 프로필 행 */}
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 p-2 dark:border-gray-700">
          <button
            onClick={() => setPopupOpen((o) => !o)}
            className="flex min-w-0 flex-1 items-center gap-2"
            aria-expanded={popupOpen}
            aria-haspopup="true"
          >
            {/* 아바타 */}
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
              </svg>
            </span>
            {/* 이메일 */}
            <span className="min-w-0 truncate text-xs text-gray-700 dark:text-gray-300">{email ?? "로딩 중..."}</span>
          </button>

          {/* 설정 바로가기 */}
          <Link
            href="/settings"
            aria-label="설정"
            className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </Link>
        </div>
      </div>
    </nav>
  );
}

interface FolderTreeItemProps {
  node: FolderNode;
  depth: number;
  selected: string | null;
  onSelect: (name: string) => void;
}

// 폴더 트리 노드 1개 — 자식 있으면 펼침/접기, 행 클릭 시 폴더 필터 선택.
// ponytail: 같은 이름 다른 부모면 함께 선택됨(전역 contains 필터). 경로 정밀 필터 필요 시 API에 path 전달.
function FolderTreeItem({ node, depth, selected, onSelect }: FolderTreeItemProps) {
  const [open, setOpen] = useState(false); // 기본 접힘
  const hasChildren = node.children.length > 0;
  const active = selected === node.name;

  return (
    <li>
      <div className="flex items-center gap-0.5" style={{ paddingLeft: depth * 12 }}>
        {hasChildren ? (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "접기" : "펼치기"}
            aria-expanded={open}
            className="shrink-0 px-0.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <span className={open ? "inline-block" : "inline-block -rotate-90"}>▾</span>
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <button
          onClick={() => onSelect(node.name)}
          aria-pressed={active}
          className={[
            "flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
            active
              ? "bg-indigo-100 font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
              : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800",
          ].join(" ")}
        >
          <span className="text-xs text-gray-400">📁</span>
          {node.name}
        </button>
      </div>
      {hasChildren && open && (
        <ul className="flex flex-col gap-0.5">
          {node.children.map((child) => (
            <FolderTreeItem
              key={child.path.join("/")}
              node={child}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
