'use client'

import { useState } from 'react'

/** 도메인 첫 영숫자 이니셜 — 파비콘 로드 실패 시 폴백용 */
function faviconInitial(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return (host.match(/[a-z0-9]/i)?.[0] ?? '#').toUpperCase()
  } catch {
    return '#'
  }
}

interface FaviconProps {
  url: string
  /** 스퀘어 크기·radius 클래스 (기본 h-9 w-9 rounded-lg) */
  boxClassName?: string
}

/**
 * 사이트 실제 파비콘 — Google s2 서비스. 로드 실패 시 그라디언트 이니셜 폴백.
 * 리스트에서 url 바뀔 때 리셋하려면 key={url} 부여.
 */
export function Favicon({ url, boxClassName = 'h-9 w-9 rounded-lg' }: FaviconProps) {
  const [errored, setErrored] = useState(false)
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {}

  if (errored || !host) {
    return (
      <span
        className={`gradient-brand flex shrink-0 items-center justify-center font-mono text-sm font-bold text-white ${boxClassName}`}
      >
        {faviconInitial(url)}
      </span>
    )
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden border border-gray-200 bg-white ${boxClassName}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
        alt=""
        width={20}
        height={20}
        onError={() => setErrored(true)}
      />
    </span>
  )
}
