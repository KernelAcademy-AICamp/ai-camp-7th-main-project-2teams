'use client'

import { useRef, useState, useEffect } from 'react'
import { Star, ExternalLink, Tag, Calendar, MoreVertical, Trash2 } from 'lucide-react'
import { useOnClickOutside } from 'usehooks-ts'
import { cn } from '@/lib/utils'
import type { Bookmark } from '@/hooks/useBookmarks'
import { useToggleFavorite } from '@/hooks/useToggleFavorite'
import { useDeleteBookmark } from '@/hooks/useDeleteBookmark'

interface BookmarkCardProps {
  bookmark: Bookmark
}

/** javascript: URL XSS 방어 — http/https만 허용 */
export function safeUrl(url: string): string {
  try {
    const { protocol } = new URL(url)
    if (protocol === 'https:' || protocol === 'http:') return url
  } catch {}
  return '#'
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** 즐겨찾기 상태별 접근성 레이블 — 테스트 가능하도록 export */
export function getFavoriteAriaLabel(isFavorite: boolean): string {
  return isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'
}

/** 즐겨찾기 상태별 Star 아이콘 CSS 클래스 — 테스트 가능하도록 export */
export function getFavoriteIconClass(isFavorite: boolean): string {
  return isFavorite
    ? 'fill-yellow-400 text-yellow-400'
    : 'text-gray-300 dark:text-gray-600'
}

/** 삭제 확인 메시지 — 테스트 가능하도록 export */
export function getDeleteConfirmMessage(title: string): string {
  // 제어문자(\r\n\t) 제거 — confirm 다이얼로그 텍스트 스푸핑 방어
  const safeTitle = title.replace(/[\r\n\t]/g, ' ')
  return `"${safeTitle}" 북마크를 삭제하시겠습니까?`
}

export function BookmarkCard({ bookmark }: BookmarkCardProps) {
  const { mutate: toggleFavorite, isPending: isTogglePending } = useToggleFavorite()
  const { mutate: deleteBookmark, isPending: isDeletePending } = useDeleteBookmark()

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // 외부 클릭 시 메뉴 닫힘
  useOnClickOutside(menuRef as React.RefObject<HTMLElement>, () => {
    if (isMenuOpen) setIsMenuOpen(false)
  })

  // ESC 키로 메뉴 닫힘 — usehooks-ts useEventListener는 조건부 비활성 미지원이라
  // 메뉴 열림 상태에서만 리스너 등록하도록 useEffect 직접 사용
  useEffect(() => {
    if (!isMenuOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isMenuOpen])

  const handleToggleFavorite = () => {
    toggleFavorite({ id: bookmark.id, is_favorite: !bookmark.is_favorite })
  }

  const handleDeleteClick = () => {
    setIsMenuOpen(false)
    if (!window.confirm(getDeleteConfirmMessage(bookmark.title))) return
    deleteBookmark(bookmark.id)
  }

  return (
    <article
      className={cn(
        'group flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4',
        'transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-900'
      )}
    >
      {/* 제목 + 우측 액션 그룹 */}
      <div className="flex items-start justify-between gap-2">
        <a
          href={safeUrl(bookmark.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-2 text-base font-semibold text-gray-900 hover:underline dark:text-gray-100"
        >
          {bookmark.title}
        </a>
        <div className="flex shrink-0 items-center gap-1">
          {/* 즐겨찾기 버튼 */}
          <button
            onClick={handleToggleFavorite}
            aria-label={getFavoriteAriaLabel(bookmark.is_favorite)}
            aria-pressed={bookmark.is_favorite}
            aria-busy={isTogglePending}
            disabled={isTogglePending}
            className="rounded p-0.5 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-800"
          >
            <Star size={16} className={getFavoriteIconClass(bookmark.is_favorite)} />
          </button>

          {/* 외부 링크 버튼 */}
          <a
            href={safeUrl(bookmark.url)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="새 탭에서 열기"
            className="shrink-0 text-gray-400 hover:text-brand"
          >
            <ExternalLink size={16} />
          </a>

          {/* 메뉴 버튼 + 드롭다운 */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setIsMenuOpen((prev) => !prev)}
              aria-label={isMenuOpen ? '북마크 메뉴 닫기' : '북마크 메뉴 열기'}
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              disabled={isDeletePending}
              className="rounded p-0.5 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-800"
            >
              <MoreVertical size={16} className="text-gray-400" />
            </button>

            {/* 메뉴 모달(팝업) */}
            {isMenuOpen && (
              <div
                role="menu"
                aria-label="북마크 작업 메뉴"
                className={cn(
                  'absolute right-0 top-full z-10 mt-1 min-w-[120px] rounded-lg border border-gray-200',
                  'bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800'
                )}
              >
                <button
                  role="menuitem"
                  onClick={handleDeleteClick}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600',
                    'hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
                  )}
                >
                  <Trash2 size={14} />
                  삭제
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 도메인 URL */}
      <a
        href={safeUrl(bookmark.url)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 truncate text-xs text-gray-500 hover:text-brand dark:text-gray-400"
      >
        <ExternalLink size={12} className="shrink-0" />
        <span className="truncate">{extractDomain(bookmark.url)}</span>
      </a>

      {/* 태그 뱃지 */}
      {bookmark.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag size={12} className="shrink-0 text-gray-400" />
          {bookmark.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* 저장일 */}
      <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
        <Calendar size={12} />
        <time dateTime={bookmark.created_at}>{formatDate(bookmark.created_at)}</time>
      </div>
    </article>
  )
}
