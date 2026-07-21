// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const push = vi.fn()
let params = new URLSearchParams('range=7d')
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => params,
  usePathname: () => '/admin/growth',
}))

import { GrowthDashboard } from '../GrowthDashboard'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
beforeEach(() => {
  push.mockReset()
  params = new URLSearchParams('range=7d')
})

function mockStats(status = 200) {
  vi.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (status === 200) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            range: '7d',
            okr: { activeUsers: 10, firstSaveRate: 0.6, savesPerUser: 3, newSaves: 30 },
            categories: [
              { name: '개발', count: 30, pct: 0.75 },
              { name: '미분류', count: 10, pct: 0.25 },
            ],
            growth: [],
            trending: [],
            health: { deadRatio: 0, uncategorizedRatio: 0 },
          }),
          { status: 200 }
        )
      )
    }
    return Promise.resolve(new Response(JSON.stringify({ error: 'RPC failed' }), { status }))
  })
}

describe('GrowthDashboard', () => {
  it('초기 로드 시 OKR·카테고리 렌더', async () => {
    mockStats()
    render(<GrowthDashboard />)
    await waitFor(() => expect(screen.getByText('활성 사용자')).toBeInTheDocument())
    expect(screen.getByText('개발')).toBeInTheDocument()
  })

  it('카테고리 클릭 시 category 파라미터 push', async () => {
    mockStats()
    render(<GrowthDashboard />)
    await waitFor(() => expect(screen.getByText('개발')).toBeInTheDocument())
    fireEvent.click(screen.getByText('개발'))
    expect(push).toHaveBeenCalledWith('/admin/growth?range=7d&category=%EA%B0%9C%EB%B0%9C')
  })

  it('stats API 500 응답 시 크래시 대신 에러 메시지 표시', async () => {
    mockStats(500)
    render(<GrowthDashboard />)
    await waitFor(() => expect(screen.getByText('대시보드 데이터를 불러오지 못했습니다')).toBeInTheDocument())
    expect(screen.queryByText('활성 사용자')).not.toBeInTheDocument()
  })
})
