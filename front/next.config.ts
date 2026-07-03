import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 상위 디렉토리에 다른 package-lock.json이 있어도 이 폴더를 워크스페이스 루트로 고정
  turbopack: {
    root: __dirname,
  },
}

export default nextConfig
