"use client";

import { useRef, useState, useEffect } from "react";
import { Star, ExternalLink, Tag, Calendar, MoreVertical, Trash2 } from "lucide-react";
import { useOnClickOutside } from "usehooks-ts";
import { cn } from "@/lib/utils";
import type { Bookmark } from "@/hooks/useBookmarks";
import { useToggleFavorite } from "@/hooks/useToggleFavorite";
import { useDeleteBookmark } from "@/hooks/useDeleteBookmark";
import { Favicon } from "@/components/Favicon";

interface BookmarkCardProps {
  bookmark: Bookmark;
  /** 뷰 모드 — grid(카드) · list(가로 행) · compact(밀집 행) */
  view?: "grid" | "list" | "compact";
}

/** AI 태그 칩 — Design.md: 작은 pill, 연한 블루 배경 + 블루 텍스트 */
const TAG_CHIP = "rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-brand-strong";

/** javascript: URL XSS 방어 — http/https만 허용 */
export function safeUrl(url: string): string {
  try {
    const { protocol } = new URL(url);
    if (protocol === "https:" || protocol === "http:") return url;
  } catch {}
  return "#";
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** 즐겨찾기 상태별 접근성 레이블 — 테스트 가능하도록 export */
export function getFavoriteAriaLabel(isFavorite: boolean): string {
  return isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가";
}

/** 즐겨찾기 상태별 Star 아이콘 CSS 클래스 — 테스트 가능하도록 export */
export function getFavoriteIconClass(isFavorite: boolean): string {
  return isFavorite ? "fill-yellow-400 text-yellow-400" : "text-gray-300 dark:text-gray-600";
}

/** 삭제 확인 메시지 — 테스트 가능하도록 export */
export function getDeleteConfirmMessage(title: string): string {
  // 제어문자(\r\n\t) 제거 — confirm 다이얼로그 텍스트 스푸핑 방어
  const safeTitle = title.replace(/[\r\n\t]/g, " ");
  return `"${safeTitle}" 북마크를 삭제하시겠습니까?`;
}

export function BookmarkCard({ bookmark, view = "grid" }: BookmarkCardProps) {
  const { mutate: toggleFavorite, isPending: isTogglePending } = useToggleFavorite();
  const { mutate: deleteBookmark, isPending: isDeletePending } = useDeleteBookmark();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 메뉴 닫힘
  useOnClickOutside(menuRef as React.RefObject<HTMLElement>, () => {
    if (isMenuOpen) setIsMenuOpen(false);
  });

  // ESC 키로 메뉴 닫힘 — usehooks-ts useEventListener는 조건부 비활성 미지원이라
  // 메뉴 열림 상태에서만 리스너 등록하도록 useEffect 직접 사용
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMenuOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMenuOpen]);

  const handleToggleFavorite = () => {
    toggleFavorite({ id: bookmark.id, is_favorite: !bookmark.is_favorite });
  };

  const handleDeleteClick = () => {
    setIsMenuOpen(false);
    if (!window.confirm(getDeleteConfirmMessage(bookmark.title))) return;
    deleteBookmark(bookmark.id);
  };

  // 메뉴 버튼 + 드롭다운 — 일반/컴팩트 공유
  const menu = (
    <div ref={menuRef} className="relative flex items-center">
      <button
        onClick={() => setIsMenuOpen((prev) => !prev)}
        aria-label={isMenuOpen ? "북마크 메뉴 닫기" : "북마크 메뉴 열기"}
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        disabled={isDeletePending}
        className="inline-flex items-center justify-center rounded p-0.5 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-800"
      >
        <MoreVertical size={16} className="text-gray-400" />
      </button>

      {isMenuOpen && (
        <div
          role="menu"
          aria-label="북마크 작업 메뉴"
          className={cn(
            "absolute right-0 top-full z-10 mt-1 min-w-[120px] rounded-lg border border-gray-200",
            "bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800",
          )}
        >
          <button
            role="menuitem"
            onClick={handleDeleteClick}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600",
              "hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20",
            )}
          >
            <Trash2 size={14} />
            삭제
          </button>
        </div>
      )}
    </div>
  );

  // 즐겨찾기 토글 버튼 — 뷰 공통 (size만 다름)
  const favButton = (size: number) => (
    <button
      onClick={handleToggleFavorite}
      aria-label={getFavoriteAriaLabel(bookmark.is_favorite)}
      aria-pressed={bookmark.is_favorite}
      aria-busy={isTogglePending}
      disabled={isTogglePending}
      className="inline-flex shrink-0 items-center justify-center rounded p-0.5 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-800"
    >
      <Star size={size} className={getFavoriteIconClass(bookmark.is_favorite)} />
    </button>
  );

  // 컴팩트 뷰 — 조밀한 한 줄 행 (부모 divide-y로 구분선). 액션은 hover 시 노출.
  if (view === "compact") {
    return (
      <article className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
        <Favicon url={bookmark.url} boxClassName="h-6 w-6 rounded-md" />
        <a
          href={safeUrl(bookmark.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 hover:underline dark:text-gray-100"
        >
          {bookmark.title}
        </a>
        <span className="hidden max-w-[160px] shrink-0 truncate font-mono text-xs text-gray-400 sm:inline dark:text-gray-500">
          {extractDomain(bookmark.url)}
        </span>
        {bookmark.tags[0] && <span className={cn(TAG_CHIP, "hidden shrink-0 md:inline")}>{bookmark.tags[0]}</span>}
        <div className="flex shrink-0 items-center gap-0.5">
          {favButton(14)}
          <span className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            {menu}
          </span>
        </div>
      </article>
    );
  }

  // 리스트 뷰 — 큰 가로 행 카드 (파비콘 + 제목 + 메타 한 줄)
  if (view === "list") {
    return (
      <article className="group flex items-center gap-4 rounded-xl border border-line bg-white p-4 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-md">
        <Favicon url={bookmark.url} boxClassName="h-12 w-12 rounded-xl" />
        <div className="min-w-0 flex-1">
          <a
            href={safeUrl(bookmark.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="line-clamp-1 block text-base font-semibold text-gray-900 hover:underline dark:text-gray-100"
          >
            {bookmark.title}
          </a>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400 dark:text-gray-500">
            <span className="font-mono">{extractDomain(bookmark.url)}</span>
            {bookmark.tags.length > 0 && <span aria-hidden>·</span>}
            {bookmark.tags.map((tag) => (
              <span key={tag} className={TAG_CHIP}>
                {tag}
              </span>
            ))}
            <span aria-hidden>·</span>
            <time dateTime={bookmark.created_at} className="font-mono">
              {formatDate(bookmark.created_at)}
            </time>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 self-start">
          {favButton(16)}
          {menu}
        </div>
      </article>
    );
  }

  // 그리드 뷰 — 세로 카드
  return (
    <article
      className={cn(
        "group flex flex-col gap-3 rounded-xl border border-line bg-white p-4",
        "shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-md",
      )}
    >
      {/* 파비콘 + 제목 + 우측 액션 그룹 */}
      <div className="flex items-center gap-3">
        {/* 사이트 파비콘 (실패 시 그라디언트 이니셜 폴백) */}
        <Favicon url={bookmark.url} />
        <a
          href={safeUrl(bookmark.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-1 min-w-0 flex-1 text-base font-semibold text-gray-900 hover:underline dark:text-gray-100"
        >
          {bookmark.title}
        </a>
        <div className="flex shrink-0 items-center gap-1">
          {/* 즐겨찾기 버튼 */}
          {favButton(16)}

          {/* 외부 링크 버튼 */}
          <a
            href={safeUrl(bookmark.url)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="새 탭에서 열기"
            className="inline-flex shrink-0 items-center justify-center rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-brand dark:hover:bg-gray-800"
          >
            <ExternalLink size={16} />
          </a>

          {/* 메뉴 버튼 + 드롭다운 */}
          {menu}
        </div>
      </div>

      {/* 도메인 URL */}
      <a
        href={safeUrl(bookmark.url)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 truncate font-mono text-xs text-gray-500 hover:text-brand dark:text-gray-400"
      >
        <ExternalLink size={12} className="shrink-0" />
        <span className="truncate">{extractDomain(bookmark.url)}</span>
      </a>

      {/* 태그 뱃지 */}
      {bookmark.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag size={12} className="shrink-0 text-gray-400" />
          {bookmark.tags.map((tag) => (
            <span key={tag} className={TAG_CHIP}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* 저장일 — 상단 보더 위 모노 날짜 */}
      <div className="mt-auto flex items-center gap-1 border-t border-gray-100 pt-2.5 font-mono text-xs text-gray-400 dark:border-gray-800 dark:text-gray-500">
        <Calendar size={12} />
        <time dateTime={bookmark.created_at}>{formatDate(bookmark.created_at)}</time>
      </div>
    </article>
  );
}
