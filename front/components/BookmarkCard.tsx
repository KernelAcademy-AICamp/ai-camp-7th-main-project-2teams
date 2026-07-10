"use client";

import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Star,
  ExternalLink,
  Tag,
  Shapes,
  Calendar,
  MoreVertical,
  Trash2,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { useOnClickOutside } from "usehooks-ts";
import { cn } from "@/lib/utils";
import type { Bookmark } from "@/hooks/useBookmarks";
import { useToggleFavorite } from "@/hooks/useToggleFavorite";
import { useDeleteBookmark } from "@/hooks/useDeleteBookmark";
import { useRecheckBookmark } from "@/hooks/useRecheckBookmark";
import { Favicon } from "@/components/Favicon";
import { EditBookmarkModal } from "@/components/EditBookmarkModal";

interface BookmarkCardProps {
  bookmark: Bookmark;
  /** 뷰 모드 — grid(카드) · list(가로 행) · compact(밀집 행) */
  view?: "grid" | "list" | "compact";
}

/** AI 태그 칩 — Design.md: 작은 pill, 연한 블루 배경 + 블루 텍스트 */
const TAG_CHIP = "rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-brand-strong";

/** 카테고리 배지 — TAG_CHIP(채워진 블루 pill)과 색상·형태 구분: 보라 톤 + outline(테두리만). 아이콘은 Shapes(분류) — 사이드바 "폴더" 기능과 혼동 방지 위해 Folder 아이콘 회피 */
const CATEGORY_CHIP_LIST =
  "inline-flex items-center gap-1 rounded-md border border-violet-300 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-600";
const CATEGORY_CHIP_GRID =
  "inline-flex h-8 items-center gap-1 rounded-lg border border-violet-400 bg-black/70 px-2.5 text-xs font-semibold text-violet-200 backdrop-blur-sm";

/** 죽은 링크(404/410) 경고 배지 — 카테고리 칩과 동일 outline 패턴, 앰버 톤(AddBookmarkModal 경고와 색상 통일) */
const DEAD_CHIP_LIST =
  "inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600";
const DEAD_CHIP_GRID =
  "inline-flex items-center gap-1 rounded-md border border-amber-400/50 bg-black/50 px-2 py-0.5 text-xs font-medium text-amber-300 backdrop-blur-sm";

/** 그리드 카드 썸네일 위 hover 액션 버튼 — 즐겨찾기·외부링크·메뉴 크기 통일 (고정 박스 + 내부 중앙정렬) */
const ACTION_CHIP = "inline-flex h-8 w-8 items-center justify-center rounded-lg bg-black/50 backdrop-blur-sm";

/** 죽은 링크 툴팁 너비(px) — w-56과 동일, 뷰포트 클램프 계산에 사용 */
const DEAD_TOOLTIP_WIDTH = 224;

/** 수정/삭제 드롭다운 너비(px) — min-w-[120px]과 동일, 우측 정렬 위치 계산에 사용 */
const MENU_WIDTH = 120;

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
  return isFavorite ? "fill-yellow-400 text-yellow-400" : "text-gray-300";
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
  const { mutate: recheckDeadLink, isPending: isRechecking } = useRecheckBookmark();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [thumbnailErrored, setThumbnailErrored] = useState(false);
  // 죽은 링크 재검사 결과 안내 — 재검사할 때마다 초기화, 세션 내에서만 유지(영속 저장 안 함)
  const [recheckMessage, setRecheckMessage] = useState<string | null>(null);
  // 죽은 링크 툴팁 — 그리드가 각 카드를 개별 stacking context(순차 리빌 애니메이션)로 감싸서
  // CSS group-hover만으로는 옆 카드 위로 올라오지 못함(z-index가 카드 내부로 갇힘).
  // body에 portal로 그려서 그리드의 stacking context를 완전히 벗어나게 함.
  const [isDeadTooltipOpen, setIsDeadTooltipOpen] = useState(false);
  const [deadTooltipPos, setDeadTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const deadBadgeRef = useRef<HTMLSpanElement>(null);
  // 수정/삭제 드롭다운 — 죽은 링크 툴팁과 동일 이유로 portal. 트리거 버튼과 portal된 드롭다운
  // 양쪽 다 "내부 클릭"으로 인식해야 하므로 useOnClickOutside에 두 ref를 배열로 전달.
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuDropdownRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 메뉴 닫힘
  useOnClickOutside(
    [menuTriggerRef, menuDropdownRef] as React.RefObject<HTMLElement>[],
    () => {
      if (isMenuOpen) setIsMenuOpen(false);
    },
  );

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

  const handleEditClick = () => {
    setIsMenuOpen(false);
    setIsEditOpen(true);
  };

  const toggleMenu = () => {
    if (isMenuOpen) {
      setIsMenuOpen(false);
      return;
    }
    const rect = menuTriggerRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - MENU_WIDTH) });
    }
    setIsMenuOpen(true);
  };

  const openDeadTooltip = () => {
    const rect = deadBadgeRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - DEAD_TOOLTIP_WIDTH - 8);
    setDeadTooltipPos({ top: rect.bottom + 6, left });
    setIsDeadTooltipOpen(true);
  };
  const closeDeadTooltip = () => setIsDeadTooltipOpen(false);

  const handleRecheck = () => {
    setRecheckMessage(null);
    recheckDeadLink(bookmark.id, {
      onSuccess: ({ bookmark: result }) => {
        setRecheckMessage(result.is_dead ? "여전히 응답 없음" : "복구됨 — 정상 링크예요");
      },
      onError: () => setRecheckMessage("재검사 실패, 잠시 후 다시 시도해주세요"),
    });
  };

  // 메뉴 버튼 + 드롭다운 — 일반/컴팩트/그리드 공유. className으로 버튼 자체 크기 오버라이드 가능
  // (그리드 오버레이에서 감싸는 배경 span 없이 버튼 자체가 칩 크기를 갖도록).
  // 드롭다운 자체는 portal로 body에 그려서 카드별 stacking context(순차 리빌 애니메이션)를
  // 벗어남 — 그냥 z-index만 올리면 카드 안에 갇혀 아래쪽 카드에 가려짐(죽은 링크 툴팁과 동일 이유).
  const menu = (buttonClassName?: string) => (
    <div className="relative flex items-center">
      <button
        ref={menuTriggerRef}
        onClick={toggleMenu}
        aria-label={isMenuOpen ? "북마크 메뉴 닫기" : "북마크 메뉴 열기"}
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        disabled={isDeletePending}
        className={cn(
          "inline-flex cursor-pointer items-center justify-center rounded p-0.5 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50",
          buttonClassName,
        )}
      >
        <MoreVertical size={16} className="text-gray-400" />
      </button>

      {isMenuOpen &&
        menuPos &&
        createPortal(
          <div
            ref={menuDropdownRef}
            role="menu"
            aria-label="북마크 작업 메뉴"
            style={{ position: "fixed", top: menuPos.top, left: menuPos.left }}
            className="z-50 min-w-[120px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          >
            <button
              role="menuitem"
              onClick={handleEditClick}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-primary",
                "hover:bg-slate-50",
              )}
            >
              <Pencil size={14} />
              수정
            </button>
            <button
              role="menuitem"
              onClick={handleDeleteClick}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-red-600",
                "hover:bg-red-50",
              )}
            >
              <Trash2 size={14} />
              삭제
            </button>
          </div>,
          document.body,
        )}
    </div>
  );

  const editModal = isEditOpen && <EditBookmarkModal bookmark={bookmark} onClose={() => setIsEditOpen(false)} />;

  // 즐겨찾기 토글 버튼 — 뷰 공통 (size·className 오버라이드 가능)
  const favButton = (size: number, buttonClassName?: string) => (
    <button
      onClick={handleToggleFavorite}
      aria-label={getFavoriteAriaLabel(bookmark.is_favorite)}
      aria-pressed={bookmark.is_favorite}
      aria-busy={isTogglePending}
      disabled={isTogglePending}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center rounded p-0.5 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50",
        buttonClassName,
      )}
    >
      <Star size={size} className={getFavoriteIconClass(bookmark.is_favorite)} />
    </button>
  );

  // 컴팩트 뷰 — 조밀한 한 줄 행 (부모 divide-y로 구분선). 액션은 hover 시 노출.
  if (view === "compact") {
    return (
      <>
        <article className="group flex items-center gap-3 px-3 py-2 transition-colors hover:bg-gray-50">
          <Favicon url={bookmark.url} boxClassName="h-5 w-5 rounded" />
          <a
            href={safeUrl(bookmark.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 hover:underline"
          >
            {bookmark.title}
          </a>
          <span className="hidden max-w-[160px] shrink-0 truncate font-mono text-xs text-gray-400 sm:inline">
            {extractDomain(bookmark.url)}
          </span>
          {bookmark.is_dead && (
            <span className="hidden shrink-0 sm:inline" title="링크 끊김 의심">
              <AlertTriangle size={12} className="text-amber-500" aria-label="링크 끊김 의심" />
            </span>
          )}
          {bookmark.category && (
            <span className={cn(CATEGORY_CHIP_LIST, "hidden shrink-0 md:inline-flex")}>
              <Shapes size={10} />
              {bookmark.category}
            </span>
          )}
          <div className="flex shrink-0 items-center gap-0.5">
            {favButton(14)}
            <span className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              {menu()}
            </span>
          </div>
        </article>
        {editModal}
      </>
    );
  }

  // 리스트 뷰 — 큰 가로 행 카드 (파비콘 + 제목 + 메타 한 줄)
  if (view === "list") {
    return (
      <>
        <article className="group flex items-center gap-4 rounded-md border border-line bg-white p-4 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-md">
          <Favicon url={bookmark.url} boxClassName="h-12 w-12 rounded-xl" />
          <div className="min-w-0 flex-1">
            <a
              href={safeUrl(bookmark.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="line-clamp-2 text-base font-semibold text-gray-900 hover:underline"
            >
              {bookmark.title}
            </a>
            {bookmark.description && (
              <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{bookmark.description}</p>
            )}
            {/* 모바일 — 2줄: 카테고리+태그 / url+date(between으로 양끝 분리) */}
            <div className="mt-1 flex flex-col gap-1 text-xs text-gray-400 sm:hidden">
              {(bookmark.category || bookmark.is_dead || bookmark.tags.length > 0) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {bookmark.category && (
                    <span className={CATEGORY_CHIP_LIST}>
                      <Shapes size={10} />
                      {bookmark.category}
                    </span>
                  )}
                  {bookmark.is_dead && (
                    <span className={DEAD_CHIP_LIST}>
                      <AlertTriangle size={10} />
                      링크 끊김
                    </span>
                  )}
                  {bookmark.tags.map((tag) => (
                    <span key={tag} className={TAG_CHIP}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono">{extractDomain(bookmark.url)}</span>
                <time dateTime={bookmark.created_at} className="shrink-0 font-mono">
                  {formatDate(bookmark.created_at)}
                </time>
              </div>
            </div>

            {/* 데스크톱 — 기존 한 줄 유지 */}
            <div className="mt-1 hidden flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400 sm:flex">
              <span className="font-mono">{extractDomain(bookmark.url)}</span>
              {bookmark.category && (
                <>
                  <span aria-hidden>·</span>
                  <span className={CATEGORY_CHIP_LIST}>
                    <Shapes size={10} />
                    {bookmark.category}
                  </span>
                </>
              )}
              {bookmark.is_dead && (
                <>
                  <span aria-hidden>·</span>
                  <span className={DEAD_CHIP_LIST}>
                    <AlertTriangle size={10} />
                    링크 끊김
                  </span>
                </>
              )}
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
            {menu()}
          </div>
        </article>
        {editModal}
      </>
    );
  }

  // 그리드 뷰 — 미디어 카드 (썸네일 상단 + 다크 정보 패널)
  // 바깥 wrapper는 overflow-hidden 없는 relative — 죽은 링크 툴팁이 article/썸네일의
  // overflow-hidden(둥근 모서리용)에 잘리지 않게 이 레벨에서 절대 위치시키기 위함.
  return (
    <div className="relative">
      <article className="group flex flex-col overflow-hidden rounded-md bg-gray-900 shadow-lg transition-shadow hover:shadow-2xl">
        {/* 썸네일 — 없으면 파비콘 그라디언트 커버로 대체 */}
        <div className="relative aspect-video w-full shrink-0 overflow-hidden bg-gray-800">
          {bookmark.thumbnail_url && !thumbnailErrored ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/thumbnail?id=${bookmark.id}`}
              alt=""
              loading="lazy"
              onError={() => setThumbnailErrored(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="gradient-brand flex h-full w-full items-center justify-center">
              <Favicon url={bookmark.url} boxClassName="h-12 w-12 rounded-xl" />
            </div>
          )}

          {/* 카테고리 배지 — 썸네일 좌상단, 항상 노출 (액션 오버레이와 달리 hover 불필요) */}
          {bookmark.category && (
            <div className="absolute left-2 top-2">
              <span className={CATEGORY_CHIP_GRID}>
                <Shapes size={10} />
                {bookmark.category}
              </span>
            </div>
          )}

          {/* 죽은 링크 배지 트리거 자리 — 실제 배지+툴팁은 article 밖(overflow-hidden 미적용 wrapper)에서 렌더.
              이 안에 두면 카드/썸네일의 overflow-hidden에 툴팁이 잘려 모바일 좁은 카드에서 안 보이는 문제 발생. */}

          {/* 액션 오버레이 — hover/focus 시 노출 */}
          <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            {favButton(14, cn(ACTION_CHIP, "text-white hover:bg-black/70"))}
            <a
              href={safeUrl(bookmark.url)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="새 탭에서 열기"
              className={cn(ACTION_CHIP, "text-white transition-colors hover:bg-black/70")}
            >
              <ExternalLink size={14} />
            </a>
            {menu(cn(ACTION_CHIP, "text-white hover:bg-black/70"))}
          </div>
        </div>

        {/* 정보 패널 */}
        <div className="flex flex-1 flex-col gap-2 p-4">
          <a
            href={safeUrl(bookmark.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="line-clamp-2 text-lg font-bold leading-snug text-white hover:underline"
          >
            {bookmark.title}
          </a>

          {/* AI 요약 설명 */}
          {bookmark.description && <p className="line-clamp-2 text-sm text-gray-400">{bookmark.description}</p>}

          {/* 도메인 URL */}
          <a
            href={safeUrl(bookmark.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-sm font-medium text-brand hover:underline"
          >
            {extractDomain(bookmark.url)}
          </a>

          {/* 태그 뱃지 — 좁은 화면에서 한 줄 넘어가면 wrap 대신 가로 슬라이드 */}
          {bookmark.tags.length > 0 && (
            <div
              className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap pt-1 [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: "none" }}
            >
              <Tag size={12} className="shrink-0 text-gray-500" />
              {bookmark.tags.map((tag) => (
                <span key={tag} className={cn(TAG_CHIP, "shrink-0")}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* 저장일 */}
          <div className="mt-auto flex items-center gap-1 border-t border-white/10 pt-2.5 font-mono text-xs text-gray-500">
            <Calendar size={12} />
            <time dateTime={bookmark.created_at}>{formatDate(bookmark.created_at)}</time>
          </div>
        </div>
      </article>

      {/* 죽은 링크 배지 트리거 — article/썸네일 바깥(overflow-hidden 없는 wrapper)에서 절대 위치.
          카테고리 배지가 있으면 그 아래로 쌓음. 툴팁 본체는 portal(아래)로 body에 그려서
          그리드 카드의 stacking context(순차 리빌 애니메이션이 만드는)를 완전히 벗어남 —
          그냥 z-index만 올리면 카드 내부에 갇혀 옆 카드에 다시 가려짐. */}
      {bookmark.is_dead && (
        <span
          ref={deadBadgeRef}
          className={cn(DEAD_CHIP_GRID, "absolute left-2 z-10 cursor-default", bookmark.category ? "top-11" : "top-2")}
          tabIndex={0}
          onMouseEnter={openDeadTooltip}
          onMouseLeave={closeDeadTooltip}
          onFocus={openDeadTooltip}
          onBlur={closeDeadTooltip}
        >
          <AlertTriangle size={10} />
          링크 끊김
        </span>
      )}

      {isDeadTooltipOpen &&
        deadTooltipPos &&
        createPortal(
          <div
            role="tooltip"
            onMouseEnter={openDeadTooltip}
            onMouseLeave={closeDeadTooltip}
            style={{ position: "fixed", top: deadTooltipPos.top, left: deadTooltipPos.left }}
            className="z-50 w-56 rounded-lg bg-gray-900 p-2.5 text-xs text-gray-200 shadow-xl"
          >
            저장 시점에 404/410 응답을 확인했어요. 지금은 복구됐을 수 있어요.
            <button
              type="button"
              onClick={handleRecheck}
              disabled={isRechecking}
              className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-white/20 bg-white/10 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={11} className={cn(isRechecking && "animate-spin")} />
              {isRechecking ? "확인 중..." : "지금 다시 확인"}
            </button>
            {recheckMessage && <p className="mt-1.5 text-[11px] font-medium text-mint">{recheckMessage}</p>}
          </div>,
          document.body,
        )}

      {editModal}
    </div>
  );
}
