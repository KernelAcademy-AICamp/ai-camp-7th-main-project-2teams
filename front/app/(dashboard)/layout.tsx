import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { OnboardingGuideButton } from "@/components/OnboardingGuideButton";
import { AddBookmarkModal } from "@/components/AddBookmarkModal";
import markLogo from "@/assets/mowaba_logo.png";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#F1F5F9] dark:bg-gray-950">
      {/* 시그니처 그라디언트 상단바 (Design.md Top Bar) */}
      <header className="gradient-brand shadow-[0_4px_14px_-8px_rgba(15,23,42,.4)]">
        <div className="flex h-14 items-center justify-between px-6">
          <Link href="/" aria-label="모와바 홈" className="flex items-center">
            {/* 흰 라운드 칩 안에 심볼 마크만 — 텍스트 없음 */}
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm">
              <Image src={markLogo} alt="Mowaba" width={26} height={23} priority />
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <OnboardingGuideButton />
            <Link
              href="/import"
              className="rounded-[11px] border border-white/40 bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              파일 업로드
            </Link>
            <AddBookmarkModal triggerClassName="rounded-[11px] bg-white px-3 py-1.5 text-sm font-semibold text-teal-700 shadow-sm transition-transform hover:-translate-y-px" />
          </div>
        </div>
      </header>
      <div className="flex min-h-0 w-full flex-1">{children}</div>
    </div>
  );
}
