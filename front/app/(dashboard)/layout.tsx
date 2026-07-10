import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { Plus, Upload } from "lucide-react";
import { OnboardingGuideButton } from "@/components/OnboardingGuideButton";
import { AddBookmarkModal } from "@/components/AddBookmarkModal";
import markLogo from "@/assets/mowaba_logo.png";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface">
      {/* 시그니처 그라디언트 상단바 (Design.md Top Bar) */}
      <header className="gradient-brand shadow-[0_4px_14px_-8px_rgba(15,23,42,.4)]">
        <div className="flex h-14 items-center justify-between px-6">
          <Link href="/" aria-label="모와바 홈" className="flex items-center">
            {/* 흰 라운드 칩 안에 심볼 마크만 — 텍스트 없음 */}
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm">
              <Image src={markLogo} alt="Mowaba" width={26} height={23} priority />
            </span>
          </Link>
          {/* 업로드/추가 — 모바일은 아이콘 전용(h-10 w-10, rounded-md), 데스크탑(md+)은 원래 텍스트 필 형태 */}
          <div className="flex items-center gap-3">
            <OnboardingGuideButton />
            <Link
              href="/import"
              aria-label="파일 업로드"
              className="flex h-10 w-10 items-center justify-center rounded-md border border-white/40 bg-white/10 text-white transition-colors hover:bg-white/20 md:h-auto md:w-auto md:rounded-[11px] md:px-3 md:py-1.5"
            >
              <Upload className="h-4 w-4 md:hidden" />
              <span className="hidden text-sm font-medium md:inline">파일 업로드</span>
            </Link>
            <AddBookmarkModal
              triggerClassName="flex h-10 w-10 items-center justify-center rounded-md bg-white text-brand shadow-sm transition-transform hover:-translate-y-px md:h-auto md:w-auto md:rounded-lg md:px-3 md:py-1.5"
              triggerContent={
                <>
                  <Plus className="h-5 w-5 md:hidden" />
                  <span className="hidden text-sm font-semibold md:inline">+ 북마크 추가</span>
                </>
              }
              triggerAriaLabel="북마크 추가"
            />
          </div>
        </div>
      </header>
      <div className="flex min-h-0 w-full flex-1">{children}</div>
    </div>
  );
}
