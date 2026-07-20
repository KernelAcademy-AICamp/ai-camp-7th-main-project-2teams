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

  it('fetch 실패(비정상 응답) 시 에러 메시지 표시, 무한 로딩 아님', async () => {
    params = new URLSearchParams('category=개발&range=7d')
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('server error', { status: 500 }))

    render(<CategoryDrilldownModal range="7d" />)

    expect(await screen.findByText('하위 태그를 불러오지 못했습니다')).toBeInTheDocument()
    expect(screen.queryByText('불러오는 중…')).not.toBeInTheDocument()
  })

  it('fetch가 reject되면 에러 메시지 표시, 무한 로딩 아님', async () => {
    params = new URLSearchParams('category=개발&range=7d')
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network error'))

    render(<CategoryDrilldownModal range="7d" />)

    expect(await screen.findByText('하위 태그를 불러오지 못했습니다')).toBeInTheDocument()
    expect(screen.queryByText('불러오는 중…')).not.toBeInTheDocument()
  })

  it('A 카테고리 에러 후 B로 전환 시 B 페치 완료 전까지 stale 에러 아닌 로딩 표시', async () => {
    // A: 에러로 종료
    params = new URLSearchParams('category=A&range=7d')
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('network error'))

    const { rerender } = render(<CategoryDrilldownModal range="7d" />)

    expect(await screen.findByText('하위 태그를 불러오지 못했습니다')).toBeInTheDocument()

    // B로 전환 — B의 fetch는 수동으로 resolve 시점을 제어(아직 응답 없음)
    let resolveB: (value: Response) => void = () => {}
    const bPromise = new Promise<Response>((resolve) => {
      resolveB = resolve
    })
    vi.spyOn(global, 'fetch').mockReturnValueOnce(bPromise)
    params = new URLSearchParams('category=B&range=7d')
    rerender(<CategoryDrilldownModal range="7d" />)

    // B의 fetch가 아직 끝나지 않았으므로 A의 stale 에러가 아니라 로딩이 보여야 함
    expect(await screen.findByText('불러오는 중…')).toBeInTheDocument()
    expect(screen.queryByText('하위 태그를 불러오지 못했습니다')).not.toBeInTheDocument()

    // B의 fetch를 resolve하면 정상적으로 데이터가 반영됨
    resolveB(
      new Response(
        JSON.stringify({ range: '7d', category: 'B', tags: [{ tag: 'Vue', count: 1, pct: 1 }] }),
        { status: 200 }
      )
    )
    await waitFor(() => expect(screen.getByText('Vue')).toBeInTheDocument())
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
