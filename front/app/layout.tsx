import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });

export const metadata: Metadata = {
  title: {
    default: '모와바 · 북마크 AI',
    template: '%s · 모와바',
  },
  description: '모와바(Mowaba) — AI가 자동 태깅·분류하고 자연어로 다시 찾는 북마크 관리 서비스',
  applicationName: '모와바',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" className={cn("font-sans", geist.variable)}>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
