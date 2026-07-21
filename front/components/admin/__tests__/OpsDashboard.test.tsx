// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

let params = new URLSearchParams('range=7d')
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => params,
  usePathname: () => '/admin/ops',
}))

import { OpsDashboard } from '../OpsDashboard'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
beforeEach(() => {
  params = new URLSearchParams('range=7d')
})

function mockFetch() {
  vi.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/admin/openai-usage')) {
      return Promise.resolve(
        new Response(JSON.stringify({ available: true, totalCostUsd: 2, totalTokens: 0, byModel: [] }), { status: 200 })
      )
    }
    if (url.includes('/api/admin/admins')) {
      return Promise.resolve(new Response(JSON.stringify({ admins: [] }), { status: 200 }))
    }
    return Promise.resolve(
      new Response(
        JSON.stringify({
          range: '7d',
          okr: { activeUsers: 10, firstSaveRate: 0.6, savesPerUser: 3, newSaves: 30 },
          categories: [{ name: '개발', count: 30, pct: 0.75 }],
          growth: [],
          trending: [],
          health: { deadRatio: 0.1, uncategorizedRatio: 0.2 },
        }),
        { status: 200 }
      )
    )
  })
}

describe('OpsDashboard', () => {
  it('초기 로드 시 OpenAI 사용량 렌더', async () => {
    mockFetch()
    render(<OpsDashboard />)
    await waitFor(() => expect(screen.getByText('$2.00')).toBeInTheDocument())
  })

  it('stats API 500 응답 시 크래시 대신 에러 메시지 표시', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/admin/openai-usage')) {
        return Promise.resolve(
          new Response(JSON.stringify({ available: true, totalCostUsd: 2, totalTokens: 0, byModel: [] }), { status: 200 })
        )
      }
      if (url.includes('/api/admin/admins')) {
        return Promise.resolve(new Response(JSON.stringify({ admins: [] }), { status: 200 }))
      }
      return Promise.resolve(new Response(JSON.stringify({ error: 'RPC failed' }), { status: 500 }))
    })
    render(<OpsDashboard />)
    await waitFor(() => expect(screen.getByText('대시보드 데이터를 불러오지 못했습니다')).toBeInTheDocument())
  })
})
