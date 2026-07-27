"use client";

import Link from "next/link";

/** 하위 세그먼트 렌더 오류 바운더리. error.message는 노출하지 않는다(내부 정보 누출 방지). */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface px-4 text-center">
      <p className="font-mono text-sm font-bold tracking-widest text-text-secondary">500</p>

      <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">불러오지 못한 페이지입니다</h1>

      <div className="flex flex-wrap justify-center gap-3">
        <button
          onClick={reset}
          className="gradient-brand cursor-pointer rounded-xl px-6 py-3 font-semibold text-white transition-transform hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-brand-strong focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          다시 시도
        </button>
        <Link
          href="/"
          className="rounded-xl border border-line bg-surface-card px-6 py-3 font-semibold text-ink transition-colors hover:border-brand hover:text-brand-strong focus-visible:ring-2 focus-visible:ring-brand-strong focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          홈으로
        </Link>
      </div>

      {error.digest && <p className="font-mono text-xs text-text-secondary">오류 코드 {error.digest}</p>}
    </main>
  );
}
