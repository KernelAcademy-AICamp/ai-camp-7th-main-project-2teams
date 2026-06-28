'use client'

import { Star, ExternalLink, Tag, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Bookmark } from '@/hooks/useBookmarks'
import { useToggleFavorite } from '@/hooks/useToggleFavorite'

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

export function BookmarkCard({ bookmark }: BookmarkCardProps) {
  const { mutate: toggleFavorite, isPending } = useToggleFavorite()

  const handleToggleFavorite = () => {
    toggleFavorite({ id: bookmark.id, is_favorite: !bookmark.is_favorite })
  }

  return (
    <article
      className={cn(
        'group flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4',
        'transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-900'
      )}
    >
      {/* 제목 + 즐겨찾기 버튼 + 외부 링크 */}
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
          <button
            onClick={handleToggleFavorite}
            aria-label={getFavoriteAriaLabel(bookmark.is_favorite)}
            aria-pressed={bookmark.is_favorite}
            aria-busy={isPending}
            disabled={isPending}
            className="rounded p-0.5 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-800"
          >
            <Star size={16} className={getFavoriteIconClass(bookmark.is_favorite)} />
          </button>
          <a
            href={safeUrl(bookmark.url)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="새 탭에서 열기"
            className="shrink-0 text-gray-400 hover:text-brand"
          >
            <ExternalLink size={16} />
          </a>
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
