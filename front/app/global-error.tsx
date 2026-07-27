"use client";

import "./globals.css";

/** 루트 레이아웃 자체가 실패할 때의 최후 화면 — layout.tsx를 대체하므로 html·body를 직접 렌더한다. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko" className="font-sans">
      <body className="antialiased">
        <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface px-4 text-center">
          <p className="font-mono text-sm font-bold tracking-widest text-text-secondary">500</p>

          <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">화면을 표시하지 못했습니다</h1>

          <button
            onClick={reset}
            className="gradient-brand cursor-pointer rounded-xl px-6 py-3 font-semibold text-white transition-transform hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-brand-strong focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            다시 시도
          </button>

          {error.digest && <p className="font-mono text-xs text-text-secondary">오류 코드 {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
