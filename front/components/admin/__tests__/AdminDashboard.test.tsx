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

  it('category 파라미터가 있을 때 range 탭 클릭해도 category 유지', async () => {
    params = new URLSearchParams('range=7d&category=개발')
    mockFetch()
    render(<AdminDashboard />)
    await waitFor(() => expect(screen.getByText('활성 사용자')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '30d' }))
    expect(push).toHaveBeenCalledWith('/admin?range=30d&category=%EA%B0%9C%EB%B0%9C')
  })

  it('stats API 500 응답 시 크래시 대신 에러 메시지 표시', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/admin/openai-usage')) {
        return Promise.resolve(
          new Response(JSON.stringify({ available: true, totalCostUsd: 2, totalTokens: 0, byModel: [] }), {
            status: 200,
          })
        )
      }
      return Promise.resolve(new Response(JSON.stringify({ error: 'RPC failed' }), { status: 500 }))
    })
    render(<AdminDashboard />)
    await waitFor(() => expect(screen.getByText('대시보드 데이터를 불러오지 못했습니다')).toBeInTheDocument())
    expect(screen.queryByText('활성 사용자')).not.toBeInTheDocument()
  })
})
