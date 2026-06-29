'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAddBookmark } from '@/hooks/useAddBookmark'

function isValidUrl(value: string) {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function extractTitle(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function AddBookmarkModal() {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const { mutate, isPending, isSuccess, error, reset } = useAddBookmark()

  const handleClose = useCallback(() => {
    setOpen(false)
    setUrl('')
    setUrlError('')
    reset()
  }, [reset])

  // 모달 열릴 때 인풋 포커스
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Escape 키로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, handleClose])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) {
      setUrlError('URL을 입력해주세요.')
      return
    }
    const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`
    if (!isValidUrl(withProtocol)) {
      setUrlError('올바른 URL 형식이 아닙니다.')
      return
    }
    setUrlError('')
    mutate(
      { url: withProtocol, title: extractTitle(withProtocol) },
      { onSuccess: () => setUrl('') },
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
      >
        + 북마크 추가
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && handleClose()}
          role="dialog"
          aria-modal="true"
          aria-label="북마크 추가"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                북마크 추가
              </h2>
              <button
                onClick={handleClose}
                aria-label="닫기"
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            {isSuccess ? (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  북마크가 저장됐습니다. AI가 자동으로 태그를 생성했습니다.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { reset(); setUrl('') }}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    계속 추가
                  </button>
                  <button
                    onClick={handleClose}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
                  >
                    닫기
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <label
                    htmlFor="bookmark-url"
                    className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    URL
                  </label>
                  <input
                    ref={inputRef}
                    id="bookmark-url"
                    type="text"
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); setUrlError('') }}
                    placeholder="https://example.com"
                    disabled={isPending}
                    className={[
                      'w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors',
                      'placeholder:text-gray-400 dark:bg-gray-800 dark:text-gray-100',
                      urlError
                        ? 'border-red-400 focus:border-red-500'
                        : 'border-gray-300 focus:border-indigo-500 dark:border-gray-600 dark:focus:border-indigo-400',
                    ].join(' ')}
                  />
                  {urlError && (
                    <p className="mt-1 text-xs text-red-500">{urlError}</p>
                  )}
                </div>

                {error && (
                  <p className="text-xs text-red-500">{(error as Error).message}</p>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isPending}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="flex min-w-[80px] items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {isPending ? (
                      <span className="flex items-center gap-1.5">
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                        </svg>
                        저장 중
                      </span>
                    ) : (
                      '추가'
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
