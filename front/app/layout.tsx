import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import { Geist, Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { SITE_URL } from "@/lib/site";

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });
// Design.md 지정 본문 폰트 — 라틴/숫자, 한글은 Pretendard 우선
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

const TITLE = '모와바 · 북마크 AI'
const DESCRIPTION = '모와바(Mowaba) — AI가 자동 태깅·분류하고 자연어로 다시 찾는 북마크 관리 서비스'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: '%s · 모와바',
  },
  description: DESCRIPTION,
  applicationName: '모와바',
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    siteName: '모와바',
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" className={cn("font-sans", geist.variable, inter.variable)}>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
