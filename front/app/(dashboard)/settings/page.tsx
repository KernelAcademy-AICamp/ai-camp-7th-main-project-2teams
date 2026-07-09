'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatNetscapeBookmarks, type ExportBookmark } from '@/lib/formatNetscapeBookmarks'
import { formatKakaoChatCsv } from '@/lib/formatKakaoChatCsv'

interface AccountBookmark {
  title: string
  url: string
  tags: string[]
  category: { name: string } | null
  folder_hint: string[] | null
  created_at: string
}

export default function SettingsPage() {
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userEmailLoaded, setUserEmailLoaded] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exportDone, setExportDone] = useState(false)

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null)
      setUserEmailLoaded(true)
    })
  }, [])

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownload = async (format: 'json' | 'html' | 'csv') => {
    const res = await fetch('/api/account')
    if (!res.ok) { setError('데이터 내보내기에 실패했습니다.'); return }
    const json = await res.json()

    if (format === 'json') {
      downloadBlob(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }), 'bookmarks.json')
    } else if (format === 'html') {
      // 브라우저 북마크 가져오기 호환(Netscape 포맷) + 자체 재임포트 시 TAGS/DATA_CATEGORY로 복원
      const bookmarks: ExportBookmark[] = (json.bookmarks as AccountBookmark[]).map((b) => ({
        title: b.title,
        url: b.url,
        tags: b.tags,
        category_name: b.category?.name ?? null,
        folder_hint: b.folder_hint,
      }))
      downloadBlob(new Blob([formatNetscapeBookmarks(bookmarks)], { type: 'text/html' }), 'bookmarks.html')
    } else {
      // 카카오톡 채팅 내보내기(Date,User,Message)와 동일 포맷 — parseKakaoChat으로 재임포트 가능
      const bookmarks = (json.bookmarks as AccountBookmark[]).map((b) => ({
        title: b.title,
        url: b.url,
        created_at: b.created_at,
      }))
      downloadBlob(new Blob([formatKakaoChatCsv(bookmarks)], { type: 'text/csv' }), 'bookmarks.csv')
    }
    setExportDone(true)
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    setError(null)
    const res = await fetch('/api/account', { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? '탈퇴 처리 중 오류가 발생했습니다.')
      setIsDeleting(false)
      setShowConfirm(false)
      return
    }
    await createClient().auth.signOut()
    router.push('/goodbye')
  }

  return (
    <div className="mx-auto max-w-lg py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">설정</h1>

      {/* 계정 정보 */}
      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">계정</h2>
        <p className="text-sm text-gray-700">
          {!userEmailLoaded ? '불러오는 중...' : (userEmail ?? '이메일 미제공 (카카오)')}
        </p>
      </section>

      {/* 데이터 내보내기 */}
      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-gray-400">내 데이터</h2>
        <p className="mb-4 text-sm text-gray-500">
          저장된 북마크 전체를 내보냅니다. HTML은 브라우저 북마크 가져오기와 호환되며, 다시 가져오기 시 태그·카테고리가 그대로 복원됩니다.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => handleDownload('json')}
            className="cursor-pointer rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            JSON으로 내보내기
          </button>
          <button
            onClick={() => handleDownload('html')}
            className="cursor-pointer rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            HTML로 내보내기
          </button>
          <button
            onClick={() => handleDownload('csv')}
            className="cursor-pointer rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            CSV로 내보내기
          </button>
        </div>
      </section>

      {/* 회원 탈퇴 */}
      <section className="rounded-lg border border-red-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-red-400">위험 구역</h2>
        <p className="mb-4 text-sm text-gray-500">탈퇴 시 모든 북마크가 즉시 파기됩니다.</p>
        {error && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}
        <button
          onClick={() => setShowConfirm(true)}
          className="cursor-pointer rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
        >
          회원 탈퇴
        </button>
      </section>

      {/* 확인 모달 */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              정말 탈퇴하시겠습니까?
            </h3>
            <p className="mb-4 text-sm text-gray-500">
              북마크 전체가 영구 삭제되며 복구할 수 없습니다.
            </p>

            {/* 데이터 내보내기 유도 */}
            <div className={`mb-5 rounded-md p-3 text-sm ${exportDone ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
              {exportDone ? (
                '✓ 데이터를 내보냈습니다.'
              ) : (
                <>
                  <p className="mb-2 font-medium">탈퇴 전 데이터를 내보내세요.</p>
                  <button
                    onClick={() => handleDownload('json')}
                    className="cursor-pointer rounded border border-amber-400 px-3 py-1 text-xs font-medium hover:bg-amber-100"
                  >
                    데이터 내보내기 (JSON)
                  </button>
                </>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isDeleting}
                className="cursor-pointer rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="cursor-pointer rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeleting ? '처리 중...' : '탈퇴 확인'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
