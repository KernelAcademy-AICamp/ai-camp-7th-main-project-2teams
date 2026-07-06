'use client'

import { useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react'
import { useImportBookmarks, formatFileSize, type ImportProgress } from '@/hooks/useImportBookmarks'

export default function ImportPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [fileTypeError, setFileTypeError] = useState<string | null>(null)
  const [progress, setProgress] = useState<ImportProgress | null>(null)

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
      setProgress(null)
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
    setProgress(null)
    mutation.mutate({ formData, onProgress: setProgress })
  }

  const handleClearFile = () => {
    setFile(null)
    setFileTypeError(null)
    mutation.reset()
    setProgress(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleReupload = () => {
    setFile(null)
    setFileTypeError(null)
    mutation.reset()
    setProgress(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <main className="flex w-full flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-xl rounded-2xl border border-[#E2E8F0] bg-white p-8 shadow-[0_24px_48px_-28px_rgba(15,23,42,.30)] dark:border-gray-800 dark:bg-gray-900">
      <h1 className="mb-2 text-[25px] font-extrabold tracking-tight text-[#0F172A] dark:text-gray-100">
        파일 업로드
      </h1>
      <p className="mb-8 text-sm text-[#64748B] dark:text-gray-400">
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
              ? 'cursor-not-allowed border-[#E2E8F0] bg-surface dark:border-gray-800 dark:bg-gray-900'
              : isDragging
                ? 'cursor-pointer border-[#4A90E2] bg-[#EFF6FF] dark:border-teal-500 dark:bg-teal-950'
                : 'cursor-pointer border-[#CBD5E1] bg-white hover:border-[#93C5FD] hover:bg-[#EFF6FF] dark:border-gray-700 dark:bg-gray-900 dark:hover:border-teal-600 dark:hover:bg-gray-800',
          ].join(' ')}
        >
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl gradient-brand shadow-[0_10px_20px_-6px_rgba(74,144,226,.5)]">
            <Upload className="h-7 w-7 text-white" />
          </div>
          <p className="text-sm font-semibold text-[#334155] dark:text-gray-300">
            HTML 파일을 드래그하거나 클릭해서 선택
          </p>
          <p className="mt-1 font-mono text-xs text-[#94A3B8] dark:text-gray-500">
            .html · 최대 5MB
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
        <p role="alert" className="mt-2 text-sm text-[#DC2626] dark:text-red-400">
          {fileTypeError}
        </p>
      )}

      {/* 선택된 파일 정보 */}
      {file && !isSuccess && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 dark:border-teal-800 dark:bg-teal-950/40">
          <FileText className="h-5 w-5 shrink-0 text-[#2D6FD1] dark:text-teal-400" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm font-medium text-[#0F172A] dark:text-gray-200">
              {file.name}
            </p>
            <p className="font-mono text-xs text-[#64748B] dark:text-gray-400">
              {formatFileSize(file.size)}
            </p>
          </div>
          {!isUploading && (
            <button
              onClick={(e) => { e.stopPropagation(); handleClearFile() }}
              aria-label="파일 선택 취소"
              className="shrink-0 rounded p-1 text-[#94A3B8] hover:text-[#334155] dark:hover:text-gray-200"
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
          className="gradient-brand mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_20px_-6px_rgba(74,144,226,.5)] transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
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

      {/* 업로드 진행률 프로그레스바 */}
      {isUploading && progress && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-[#64748B] dark:text-gray-400">
            <span>처리 중…</span>
            <span className="font-mono">{progress.done} / {progress.total}건</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#E2E8F0] dark:bg-gray-800">
            <div
              className="h-full rounded-full gradient-brand transition-all duration-300"
              style={{
                width: `${progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* 성공 결과 — 틸 계열(Design.md 원칙 5: 초록 대신 브랜드 그라디언트) */}
      {isSuccess && mutation.data && (
        <div className="rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-6 dark:border-teal-800 dark:bg-teal-950/40">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full gradient-brand shadow-[0_10px_20px_-6px_rgba(74,144,226,.5)]">
              <CheckCircle className="h-5 w-5 text-white" />
            </div>
            <p className="text-lg font-extrabold text-[#2D6FD1] dark:text-teal-200">
              업로드 완료
            </p>
          </div>
          <ul className="space-y-2 text-sm text-[#334155] dark:text-teal-100">
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="h-[7px] w-[7px] rounded-sm bg-[#2D6FD1]" />
                가져오기 성공
              </span>
              <strong className="font-mono text-[#2D6FD1] dark:text-teal-300">{mutation.data.imported}건</strong>
            </li>
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="h-[7px] w-[7px] rounded-sm bg-[#94A3B8]" />
                건너뜀(중복)
              </span>
              <strong className="font-mono">{mutation.data.duplicate}건</strong>
            </li>
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="h-[7px] w-[7px] rounded-sm bg-[#D97706]" />
                처리량 초과 제외
              </span>
              <strong className="font-mono">{mutation.data.skipped}건</strong>
            </li>
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="h-[7px] w-[7px] rounded-sm bg-[#DC2626]" />
                실패
              </span>
              <strong className="font-mono">{mutation.data.failed}건</strong>
            </li>
          </ul>
          <div className="mt-5 flex gap-2">
            <button
              onClick={handleReupload}
              className="flex-1 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-semibold text-[#334155] transition-colors hover:bg-surface dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              다시 업로드
            </button>
            <button
              onClick={() => router.push('/')}
              className="gradient-brand flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_20px_-6px_rgba(74,144,226,.5)] transition-transform hover:-translate-y-px"
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
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#DC2626] dark:text-red-400" />
            <div className="flex-1">
              <p className="font-semibold text-red-800 dark:text-red-200">업로드 실패</p>
              <p className="mt-1 text-sm text-[#DC2626] dark:text-red-400">
                {mutation.error instanceof Error
                  ? mutation.error.message
                  : '알 수 없는 오류가 발생했습니다.'}
              </p>
            </div>
          </div>
          <button
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="mt-3 w-full rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-700 dark:bg-gray-900 dark:text-red-400 dark:hover:bg-red-950"
          >
            다시 시도
          </button>
        </div>
      )}
      </div>
    </main>
  )
}
