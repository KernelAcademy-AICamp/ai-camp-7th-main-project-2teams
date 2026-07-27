import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface px-4 text-center">
      <p className="font-mono text-sm font-bold tracking-widest text-text-secondary">404</p>

      <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">찾을 수 없는 페이지입니다</h1>

      <Link
        href="/"
        className="gradient-brand rounded-xl px-6 py-3 font-semibold text-white transition-transform hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-brand-strong focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        홈으로
      </Link>
    </main>
  );
}
