import { Fraunces, IBM_Plex_Mono } from 'next/font/google'
import './admin-theme.css'

// SIGNAL ROOM 테마 전용 폰트 — 메인 앱(Geist/Inter/Pretendard)과 분리
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  style: ['italic', 'normal'],
  axes: ['opsz'],
})
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
})

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`admin-theme ${fraunces.variable} ${plexMono.variable}`}>{children}</div>
  )
}
