// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import ImportPage from '../page'

// next/navigation useRouter — 페이지 내부에서 라우팅에만 쓰이므로 no-op 목으로 충분
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// useImportBookmarks 훅 자체를 목으로 교체 — mutation 상태(status/data)를 테스트별로 제어.
// formatFileSize는 순수 함수라 실제 구현 그대로 사용(importActual).
const { useImportBookmarks: useImportBookmarksMock } = vi.hoisted(() => ({
  useImportBookmarks: vi.fn(),
}))
vi.mock('@/hooks/useImportBookmarks', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useImportBookmarks')>(
    '@/hooks/useImportBookmarks',
  )
  return { ...actual, useImportBookmarks: useImportBookmarksMock }
})

function mockSuccessMutation(data: {
  imported: number
  failed: number
  skipped: number
  duplicate: number
  failedItems: { url: string; reason: string }[]
}) {
  useImportBookmarksMock.mockReturnValue({
    status: 'success',
    data,
    error: null,
    mutate: vi.fn(),
    reset: vi.fn(),
  })
}

describe('ImportPage — A61 실패 항목 상세 리스트', () => {
  beforeEach(() => {
    useImportBookmarksMock.mockReset()
  })

  it('failedItems가 빈 배열이면 "실패 항목 보기" 접이식 섹션이 렌더되지 않음', () => {
    mockSuccessMutation({ imported: 3, failed: 0, skipped: 0, duplicate: 0, failedItems: [] })

    render(<ImportPage />)

    expect(screen.queryByText(/실패 항목 보기/)).not.toBeInTheDocument()
  })

  it('failedItems가 있으면 "실패 항목 보기 (N)" 버튼이 렌더되고, 펼치면 URL+사유가 보임', () => {
    mockSuccessMutation({
      imported: 1,
      failed: 2,
      skipped: 0,
      duplicate: 0,
      failedItems: [
        { url: 'https://broken.com/', reason: '임베딩 생성 실패' },
        { url: 'https://fail.com/', reason: '저장 실패' },
      ],
    })

    render(<ImportPage />)

    const summary = screen.getByText('실패 항목 보기 (2)')
    expect(summary).toBeInTheDocument()

    // 접이식 섹션 펼치기 — <summary> 클릭으로 <details> open 토글
    fireEvent.click(summary)

    expect(screen.getByText('https://broken.com/')).toBeInTheDocument()
    expect(screen.getByText('임베딩 생성 실패')).toBeInTheDocument()
    expect(screen.getByText('https://fail.com/')).toBeInTheDocument()
    expect(screen.getByText('저장 실패')).toBeInTheDocument()
  })

  it('긴 URL은 title 속성으로 전체 URL을 노출', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(200)
    mockSuccessMutation({
      imported: 0,
      failed: 1,
      skipped: 0,
      duplicate: 0,
      failedItems: [{ url: longUrl, reason: '처리 중 오류' }],
    })

    render(<ImportPage />)
    fireEvent.click(screen.getByText('실패 항목 보기 (1)'))

    const urlEl = screen.getByText(longUrl)
    expect(urlEl).toHaveAttribute('title', longUrl)
  })
})
