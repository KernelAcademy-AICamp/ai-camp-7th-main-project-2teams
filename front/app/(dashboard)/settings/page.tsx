'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SettingsPage() {
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null)
    })
  }, [])

  const handleDownload = async () => {
    const res = await fetch('/api/account')
    if (!res.ok) { setError('데이터 내보내기에 실패했습니다.'); return }
    const json = await res.json()
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'bookmarks.json'
    a.click()
    URL.revokeObjectURL(url)
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
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">설정</h1>

      {/* 계정 정보 */}
      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">계정</h2>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {userEmail ?? '불러오는 중...'}
        </p>
      </section>

      {/* 데이터 내보내기 */}
      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-gray-400">내 데이터</h2>
        <p className="mb-4 text-sm text-gray-500">저장된 북마크 전체를 JSON으로 내보냅니다.</p>
        <button
          onClick={handleDownload}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          데이터 내보내기
        </button>
      </section>

      {/* 회원 탈퇴 */}
      <section className="rounded-lg border border-red-200 bg-white p-6 dark:border-red-900/40 dark:bg-gray-900">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-red-400">위험 구역</h2>
        <p className="mb-4 text-sm text-gray-500">탈퇴 시 모든 북마크가 즉시 파기됩니다.</p>
        {error && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}
        <button
          onClick={() => setShowConfirm(true)}
          className="rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
        >
          회원 탈퇴
        </button>
      </section>

      {/* 확인 모달 */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900">
            <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
              정말 탈퇴하시겠습니까?
            </h3>
            <p className="mb-6 text-sm text-gray-500">
              북마크 전체 삭제 후 탈퇴됩니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isDeleting}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300"
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
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
