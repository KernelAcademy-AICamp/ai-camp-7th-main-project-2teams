// front/components/admin/__tests__/CategoryDrilldownModal.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const push = vi.fn()
let params = new URLSearchParams('')
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => params,
  usePathname: () => '/admin',
}))

import { CategoryDrilldownModal } from '../CategoryDrilldownModal'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
beforeEach(() => {
  push.mockReset()
})

describe('CategoryDrilldownModal', () => {
  it('category 파라미터 없으면 렌더 안 함', () => {
    params = new URLSearchParams('')
    const { container } = render(<CategoryDrilldownModal range="7d" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('category 없을 때 Escape 눌러도 리스너 미등록으로 push 호출 안 됨', async () => {
    params = new URLSearchParams('')
    render(<CategoryDrilldownModal range="7d" />)
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(push).not.toHaveBeenCalled()
  })

  it('category 있으면 태그 데이터 페치 후 도넛 표시', async () => {
    params = new URLSearchParams('category=개발&range=7d')
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          range: '7d',
          category: '개발',
          tags: [{ tag: 'React', count: 6, pct: 0.6 }, { tag: 'Next.js', count: 4, pct: 0.4 }],
        }),
        { status: 200 }
      )
    )

    render(<CategoryDrilldownModal range="7d" />)

    await waitFor(() => expect(screen.getByText('개발')).toBeInTheDocument())
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/stats?range=7d&category=%EA%B0%9C%EB%B0%9C')
    expect(screen.getByText('React')).toBeInTheDocument()
  })

  it('닫기 클릭 시 category 파라미터 제거 push', async () => {
    params = new URLSearchParams('category=개발&range=7d')
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ tags: [] }), { status: 200 })
    )
    render(<CategoryDrilldownModal range="7d" />)
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(await screen.findByLabelText('닫기'))
    expect(push).toHaveBeenCalledWith('/admin?range=7d')
  })
})
