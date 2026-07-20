// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const push = vi.fn()
let params = new URLSearchParams('range=7d')
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => params,
  usePathname: () => '/admin',
}))

import { AdminDashboard } from '../AdminDashboard'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
beforeEach(() => {
  push.mockReset()
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
    return Promise.resolve(
      new Response(
        JSON.stringify({
          range: '7d',
          okr: { activeUsers: 10, firstSaveRate: 0.6, savesPerUser: 3, newSaves: 30 },
          categories: [{ name: '개발', count: 30, pct: 0.75 }, { name: '미분류', count: 10, pct: 0.25 }],
        }),
        { status: 200 }
      )
    )
  })
}

describe('AdminDashboard', () => {
  it('초기 로드 시 OKR·카테고리·사용량 렌더', async () => {
    mockFetch()
    render(<AdminDashboard />)
    await waitFor(() => expect(screen.getByText('활성 사용자')).toBeInTheDocument())
    expect(screen.getByText('개발')).toBeInTheDocument()
    expect(screen.getByText('$2.00')).toBeInTheDocument()
  })

  it('range 탭 클릭 시 ?range= push', async () => {
    mockFetch()
    render(<AdminDashboard />)
    await waitFor(() => expect(screen.getByText('활성 사용자')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '30d' }))
    expect(push).toHaveBeenCalledWith('/admin?range=30d')
  })
})
