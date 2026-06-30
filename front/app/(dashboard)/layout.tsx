import Link from 'next/link'
import type { ReactNode } from 'react'
import { OnboardingGuideButton } from '@/components/OnboardingGuideButton'
import { AddBookmarkModal } from '@/components/AddBookmarkModal'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50 dark:bg-gray-950">
      <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="flex h-14 items-center justify-between px-6">
          <Link href="/" className="text-lg font-bold tracking-tight text-brand">
            Bookmarker
          </Link>
          <div className="flex items-center gap-4">
            <OnboardingGuideButton />
            <Link
              href="/import"
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              파일 업로드
            </Link>
            <AddBookmarkModal />
          </div>
        </div>
      </header>
      <div className="flex min-h-0 w-full flex-1 gap-8 px-6 py-8">
        {children}
      </div>
    </div>
  )
}
