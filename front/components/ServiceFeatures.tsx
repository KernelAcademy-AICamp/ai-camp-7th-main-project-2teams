'use client'

import { useState } from 'react'

interface Feature {
  title: string
  description: string
}

type TrackKey = 'web' | 'ext'

const TRACKS: Record<TrackKey, Feature[]> = {
  web: [
    {
      title: 'URL 붙여넣기로 저장',
      description: '"+ 북마크 추가"에 링크만 붙여넣으면 제목·태그·카테고리를 AI가 자동으로 채웁니다.',
    },
    {
      title: '태그·카테고리 직접 정리',
      description: 'AI 분류가 아쉬우면 편집 모달에서 태그와 카테고리를 바로 고쳐 씁니다.',
    },
    {
      title: '기존 북마크 가져오기',
      description: '브라우저 북마크 파일(HTML) 또는 카카오톡 대화 내보내기(CSV)로 한 번에 옮겨옵니다.',
    },
    {
      title: '백업·내보내기',
      description: 'JSON·HTML·카카오 CSV로 언제든 꺼내가고, 같은 형식으로 다시 가져올 수 있습니다.',
    },
  ],
  ext: [
    {
      title: 'Chrome 익스텐션 설치',
      description: '어느 페이지에서든 클릭 한 번으로 저장할 수 있게 됩니다.',
    },
    {
      title: 'Cmd+Shift+S로 저장',
      description: '단축키 한 번으로 지금 보는 페이지를 즉시 저장합니다.',
    },
  ],
}

const TRACK_TABS: { key: TrackKey; label: string; badge: string }[] = [
  { key: 'web', label: '웹에서 바로', badge: '설치 불필요' },
  { key: 'ext', label: '익스텐션으로', badge: '더 빠르게' },
]

/**
 * 서비스 핵심 기능 안내 — 웹/익스텐션 2트랙 탭 + 공통 자연어 검색 소개
 * 랜딩 페이지 · 온보딩 페이지 · 온보딩 가이드 모달에서 공용 사용 — 카피 단일 출처
 * (자연어 검색은 대시보드 자체 기능이라 특정 트랙에 묶지 않고 상단에 독립 소개)
 */
export function ServiceFeatures() {
  const [track, setTrack] = useState<TrackKey>('web')

  return (
    <div>
      <div className="mb-6 flex items-center gap-4 rounded-lg border border-line bg-gradient-to-br from-accent to-surface p-5">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-lg border border-line bg-white">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="#4A90E2" strokeWidth="2" />
            <path d="M20 20l-3-3" stroke="#4A90E2" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <h3 className="mb-0.5 flex items-center gap-2 text-sm font-semibold text-text-primary">
            자연어 검색
            <span className="rounded-full bg-mint-soft px-2 py-0.5 text-[10px] font-bold tracking-wide text-ink uppercase">
              언제든 사용 가능
            </span>
          </h3>
          <p className="text-sm text-text-secondary">
            &ldquo;리액트 훅 정리&rdquo;처럼 검색창에 문장으로 입력하면 AI가 관련 북마크를 찾아줍니다.
          </p>
        </div>
      </div>

      {/* 익스텐션 트랙은 모바일 브라우저에서 설치·실행 자체가 불가(데스크톱 Chrome/Edge/Brave 전용) — md 미만에서 탭 숨김 */}
      <div className="mb-5 flex w-full gap-1 rounded-full bg-surface p-1 sm:inline-flex sm:w-auto" role="group" aria-label="온보딩 방법 선택">
        {TRACK_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-pressed={track === tab.key}
            onClick={() => setTrack(tab.key)}
            className={`${tab.key === 'ext' ? 'hidden md:flex' : 'flex'} flex-1 flex-col items-center gap-1 rounded-2xl px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 sm:flex-none sm:flex-row sm:gap-0 sm:rounded-full ${
              track === tab.key
                ? 'bg-white text-ink shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <span>{tab.label}</span>
            <span className="rounded-full bg-mint-soft px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-ink uppercase sm:ml-1.5">
              {tab.badge}
            </span>
          </button>
        ))}
      </div>

      {/* key={track} — 트랙 전환 시 카드가 그대로 갈아끼워지지 않고 다시 순차 리빌되게 함 */}
      <div key={track} className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {TRACKS[track].map((feature, i) => (
          <div
            key={feature.title}
            className="animate-rise rounded-xl border border-line bg-surface-card p-5 opacity-0 shadow-sm"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <div className="mb-3 flex h-7 w-7 items-center justify-center rounded-md bg-mint-soft text-xs font-bold text-ink">
              {i + 1}
            </div>
            <h4 className="mb-1.5 text-sm font-semibold text-ink">{feature.title}</h4>
            <p className="text-sm text-text-secondary">{feature.description}</p>
          </div>
        ))}
      </div>

      {track === 'ext' && (
        // Chrome 웹스토어 미게시 — placeholder href
        <a
          href="#"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block rounded-md bg-brand px-4 py-2 text-sm text-white hover:bg-brand-strong"
        >
          설치하기 (준비 중)
        </a>
      )}
    </div>
  )
}
