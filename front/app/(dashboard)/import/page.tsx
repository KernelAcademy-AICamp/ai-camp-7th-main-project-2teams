'use client'

import { useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react'
import { useImportBookmarks, formatFileSize } from '@/hooks/useImportBookmarks'

export default function ImportPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [fileTypeError, setFileTypeError] = useState<string | null>(null)

  const mutation = useImportBookmarks()

  const isUploading = mutation.status === 'pending'
  const isSuccess = mutation.status === 'success'
  const isError = mutation.status === 'error'

  // mutation 객체 전체 대신 reset 함수만 dep으로 — 불필요한 재생성 방지
  const { reset: resetMutation } = mutation

  const handleFileSelect = useCallback(
    (selected: File | null) => {
      if (!selected) return
      // 확장자 또는 MIME 중 하나라도 html이면 허용 (브라우저별 MIME 차이 대응)
      if (!selected.name.endsWith('.html') && selected.type !== 'text/html') {
        setFileTypeError('HTML(.html) 파일만 업로드할 수 있습니다.')
        setFile(null)
        return
      }
      setFileTypeError(null)
      setFile(selected)
      resetMutation()
    },
    [resetMutation],
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files?.[0] ?? null)
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (isUploading) return // 업로드 중 드롭존 상태 훼손 방지
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => setIsDragging(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (isUploading) return // 업로드 중 새 파일 선택 차단
    handleFileSelect(e.dataTransfer.files?.[0] ?? null)
  }

  const handleUpload = () => {
    if (!file || isUploading) return
    const formData = new FormData()
    formData.append('file', file)
    mutation.mutate(formData)
  }

  const handleClearFile = () => {
    setFile(null)
    setFileTypeError(null)
    mutation.reset()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleReupload = () => {
    setFile(null)
    setFileTypeError(null)
    mutation.reset()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <main className="flex w-full flex-1 flex-col items-center justify-center">
      <div className="w-full max-w-xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">
        파일 업로드
      </h1>
      <p className="mb-8 text-sm text-gray-500 dark:text-gray-400">
        Chrome 북마크 HTML 파일을 업로드하면 AI가 자동으로 분류합니다.
      </p>

      {/* 파일 드롭 영역 — 성공 패널 표시 중에는 숨김 */}
      {!isSuccess && (
        <div
          role="button"
          tabIndex={0}
          aria-label="파일 선택 영역"
          aria-disabled={isUploading}
          onClick={() => { if (!isUploading) fileInputRef.current?.click() }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !isUploading) fileInputRef.current?.click() }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={[
            'flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 transition-colors',
            isUploading
              ? 'cursor-not-allowed border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900'
              : isDragging
                ? 'cursor-pointer border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-950'
                : 'cursor-pointer border-gray-300 bg-white hover:border-indigo-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-indigo-600 dark:hover:bg-gray-800',
          ].join(' ')}
        >
          <Upload className="mb-3 h-10 w-10 text-gray-400 dark:text-gray-500" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            HTML 파일을 드래그하거나 클릭해서 선택
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            .html 형식만 지원 · 최대 5MB
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,text/html"
            className="sr-only"
            onChange={handleInputChange}
            aria-label="HTML 파일 선택"
            disabled={isUploading}
          />
        </div>
      )}

      {/* 파일 타입 오류 메시지 */}
      {fileTypeError && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {fileTypeError}
        </p>
      )}

      {/* 선택된 파일 정보 */}
      {file && !isSuccess && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
          <FileText className="h-5 w-5 shrink-0 text-indigo-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
              {file.name}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formatFileSize(file.size)}
            </p>
          </div>
          {!isUploading && (
            <button
              onClick={(e) => { e.stopPropagation(); handleClearFile() }}
              aria-label="파일 선택 취소"
              className="shrink-0 rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* 업로드 버튼 */}
      {file && !isSuccess && (
        <button
          onClick={handleUpload}
          disabled={!file || isUploading}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              업로드 중…
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              업로드
            </>
          )}
        </button>
      )}

      {/* 성공 결과 */}
      {isSuccess && mutation.data && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-6 dark:border-green-800 dark:bg-green-950">
          <div className="mb-4 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            <p className="font-semibold text-green-800 dark:text-green-200">
              업로드 완료
            </p>
          </div>
          <ul className="space-y-1 text-sm text-green-700 dark:text-green-300">
            <li>가져오기 성공: <strong>{mutation.data.imported}건</strong></li>
            <li>건너뜀(중복): <strong>{mutation.data.skipped}건</strong></li>
            <li>실패: <strong>{mutation.data.failed}건</strong></li>
          </ul>
          <div className="mt-5 flex gap-2">
            <button
              onClick={handleReupload}
              className="flex-1 rounded-lg border border-green-400 bg-transparent px-4 py-2.5 text-sm font-medium text-green-700 transition-colors hover:bg-green-100 dark:border-green-600 dark:text-green-300 dark:hover:bg-green-900"
            >
              다시 업로드
            </button>
            <button
              onClick={() => router.push('/')}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              홈으로
            </button>
          </div>
        </div>
      )}

      {/* 에러 결과 */}
      {isError && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <div className="flex-1">
              <p className="font-medium text-red-800 dark:text-red-200">업로드 실패</p>
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {mutation.error instanceof Error
                  ? mutation.error.message
                  : '알 수 없는 오류가 발생했습니다.'}
              </p>
            </div>
          </div>
          <button
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="mt-3 w-full rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-700 dark:bg-gray-900 dark:text-red-400 dark:hover:bg-red-950"
          >
            다시 시도
          </button>
        </div>
      )}
      </div>
    </main>
  )
}
