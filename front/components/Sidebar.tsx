"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Folder } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useFilterStore } from "@/store/filterStore";
import { useFolders } from "@/hooks/useFolders";
import { useCategories } from "@/hooks/useCategories";
import { buildFolderTree, type FolderNode } from "@/lib/folderTree";
import { UNCATEGORIZED_LABEL } from "@/lib/tag-alias";
import { SidebarSkeleton } from "@/components/SidebarSkeleton";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/store/userStore";

export function Sidebar() {
  const [categoryOpen, setCategoryOpen] = useState(true);
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

  const { data: categoriesData, isPending: categoriesPending } = useCategories(tab);

  // fetchUser는 zustand 스토어에서 캐시/inflight 공유 — 대시보드 페이지와 중복 호출되지 않음
  const fetchUser = useUserStore((s) => s.fetchUser);
  const [email, setEmail] = useState<string | null>(null);
  const [emailLoaded, setEmailLoaded] = useState(false);

  useEffect(() => {
    fetchUser().then((user) => {
      setEmail(user?.email ?? null);
      setEmailLoaded(true);
    });
  }, [fetchUser]);

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

  // 카테고리는 전용 API(전체 집계) 기준 — 목록 API 페이지네이션과 무관.
  // 미분류(category_id null) 있으면 맨 뒤에 한 항목으로 노출.
  const categories = useMemo(() => {
    // a-z, A-Z, ㄱ-ㅎ 순 정렬. 미분류는 정렬에서 제외하고 항상 맨 뒤에 붙임.
    const names = [...(categoriesData?.categories ?? [])].sort((a, b) => a.localeCompare(b, "ko"));
    return categoriesData?.hasUncategorized ? [...names, UNCATEGORIZED_LABEL] : names;
  }, [categoriesData]);

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
    setFolder(t === "folders" ? (folderTree[0]?.name ?? null) : null);
    setSearchQuery("");
  };

  // 내 폴더 탭 진입 시(탭 클릭 경유 안 한 새로고침·직접 진입 포함) 첫 줄 기본 선택
  useEffect(() => {
    if (tab === "folders" && folder === null && folderTree.length > 0) {
      setFolder(folderTree[0].name);
    }
  }, [tab, folder, folderTree, setFolder]);

  const handleAll = () => {
    setCategory(null);
    setTag(null);
    setFolder(null);
    setSearchQuery("");
    // 탭 유지 — 홈 전체·즐겨찾기 전체 각각 독립 동작
  };

  const handleCategory = (name: string) => {
    if (category === name) return;
    setCategory(name);
    setTag(null);
    setFolder(null);
    setSearchQuery("");
  };

  const handleFolder = (name: string) => {
    if (folder === name) return;
    setFolder(name);
    setCategory(null);
    setTag(null);
  };

  const isAllActive = category === null && folder === null;

  // 탭별 축 분리: 내 폴더 탭은 폴더 트리, 그 외는 카테고리
  // 즐겨찾기 탭도 카테고리 목록 노출 — useCategories(tab)이 즐겨찾기 북마크만 집계해서 준다.
  const showFolders = tab === "folders";
  const showCategoryList = !showFolders;
  // 폴더 탭은 폴더 쿼리, 그 외는 카테고리 쿼리 로딩 기준
  const showSkeleton = showFolders ? foldersPending : categoriesPending;

  return (
    <nav
      aria-label="북마크 필터"
      className="glass flex max-h-full w-52 shrink-0 flex-col gap-6 self-stretch overflow-x-hidden overflow-y-auto border-r border-line p-4"
    >
      {/* 상단 탭 — 홈 / 즐겨찾기 / 내 폴더(폴더 있을 때만) */}
      <section>
        <div className="flex gap-0.5 rounded-lg bg-slate-100 p-1">
          {topTabs.map((t) => (
            <button
              key={t.id}
              aria-pressed={tab === t.id}
              onClick={() => handleTabClick(t.id)}
              className={[
                "flex-1 cursor-pointer rounded-md px-1.5 py-1 text-xs font-medium transition-colors break-keep",
                tab === t.id ? "bg-white text-brand shadow-sm" : "text-text-secondary hover:text-text-primary",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {/* 카테고리 + 폴더 통합 리스트 (접기/펼치기) */}
      <section className="overflow-x-hidden overflow-y-auto">
        <button
          onClick={() => setCategoryOpen((o) => !o)}
          className="mb-2 flex w-full cursor-pointer items-center justify-between"
          aria-expanded={categoryOpen}
        >
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            {showFolders ? "폴더" : "카테고리"}
          </h2>
          <span
            className={[
              "text-xs text-text-secondary transition-transform duration-200",
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
                    "w-full cursor-pointer rounded-md border-l-4 px-3 py-1.5 text-left text-sm font-medium transition-colors",
                    isAllActive
                      ? "border-brand bg-accent text-brand"
                      : "border-transparent text-text-secondary hover:bg-slate-100",
                  ].join(" ")}
                >
                  전체
                </button>
              </li>
            )}

            {/* 유저 카테고리 — 내 폴더 탭 제외 전부 (즐겨찾기 탭은 즐겨찾기 기준 카테고리) */}
            {showCategoryList &&
              categories.map((name) => (
                <li key={`cat-${name}`}>
                  <button
                    onClick={() => handleCategory(name)}
                    aria-pressed={category === name}
                    className={[
                      "flex w-full cursor-pointer items-center gap-1.5 rounded-md border-l-4 px-3 py-1.5 text-left text-sm transition-colors",
                      category === name
                        ? "border-brand bg-accent font-medium text-brand"
                        : "border-transparent text-text-secondary hover:bg-slate-100",
                    ].join(" ")}
                  >
                    {/* 카테고리 컬러코딩 도트 (Design.md 7×7 라운드 스퀘어) */}
                    <span className="h-[7px] w-[7px] shrink-0 rounded-[2px] bg-text-secondary" />
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
        {/* 팝업 — 프로필 행 위에 표시. nav가 overflow-y-auto라 x축도 클리핑되므로
            사이드바 폭 밖(left-full) 대신 폭 안·행 위(bottom-full)로 띄운다. */}
        {popupOpen && (
          <div className="absolute bottom-full left-0 right-0 z-10 mb-2 rounded-lg border border-line bg-white py-1 shadow-lg">
            <p className="px-3 py-1.5 text-xs text-text-secondary">프로필 팝업 항목</p>
            <ul className="flex flex-col">
              <li>
                <Link
                  href="/profile"
                  onClick={() => setPopupOpen(false)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-text-primary hover:bg-slate-50"
                >
                  <span className="text-text-secondary">›</span>
                  프로필 정보
                </Link>
              </li>
              <li>
                <Link
                  href="/settings"
                  onClick={() => setPopupOpen(false)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-text-primary hover:bg-slate-50"
                >
                  <span className="text-text-secondary">›</span>
                  설정
                </Link>
              </li>
              <li>
                <button
                  onClick={handleSignOut}
                  className="flex w-full cursor-pointer items-center gap-1.5 px-3 py-2 text-sm text-text-primary hover:bg-slate-50"
                >
                  <span className="text-text-secondary">›</span>
                  로그아웃
                </button>
              </li>
            </ul>
          </div>
        )}

        {/* 프로필 행 */}
        <div className="flex items-center gap-2 rounded-lg border border-line bg-white/60 p-2">
          <button
            onClick={() => setPopupOpen((o) => !o)}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
            aria-expanded={popupOpen}
            aria-haspopup="true"
          >
            {/* 아바타 */}
            <span className="gradient-brand flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
              </svg>
            </span>
            {/* 이메일 */}
            <span className="min-w-0 truncate font-mono text-xs text-text-secondary">
              {!emailLoaded ? "로딩 중..." : (email ?? "이메일 미제공 (카카오)")}
            </span>
          </button>

          {/* 설정 바로가기 */}
          <Link href="/settings" aria-label="설정" className="shrink-0 text-text-secondary hover:text-text-primary">
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
            className="shrink-0 cursor-pointer px-0.5 text-xs text-text-secondary hover:text-text-primary"
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
            "flex flex-1 cursor-pointer items-center gap-1.5 rounded-md border-l-4 px-2 py-1.5 text-left text-sm transition-colors",
            active
              ? "border-brand bg-accent font-medium text-brand"
              : "border-transparent text-text-secondary hover:bg-slate-100",
          ].join(" ")}
        >
          <Folder size={12} className="shrink-0 text-text-secondary" />
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
