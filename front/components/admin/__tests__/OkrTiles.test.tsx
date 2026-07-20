// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { OkrTiles } from '../OkrTiles'
import { OpenAiUsage } from '../OpenAiUsage'

afterEach(cleanup)

describe('OkrTiles', () => {
  it('OKR 지표 값 렌더', () => {
    render(
      <OkrTiles okr={{ activeUsers: 12, firstSaveRate: 0.6, savesPerUser: 3.4, newSaves: 40 }} />
    )
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('60%')).toBeInTheDocument() // firstSaveRate
    expect(screen.getByText('활성 사용자')).toBeInTheDocument()
  })
})

describe('OpenAiUsage', () => {
  it('available=false면 조회 불가 표기 (무음 실패 금지)', () => {
    render(
      <OpenAiUsage
        usage={{ available: false, totalCostUsd: 0, totalTokens: 0, byModel: [] }}
        activeUsers={10}
      />
    )
    expect(screen.getByText('사용량 조회 불가')).toBeInTheDocument()
  })

  it('유저당 비용 = 총비용/활성사용자, $0.02 가정선 표시', () => {
    render(
      <OpenAiUsage
        usage={{ available: true, totalCostUsd: 2, totalTokens: 0, byModel: [] }}
        activeUsers={10}
      />
    )
    expect(screen.getByText('$0.2000')).toBeInTheDocument() // 2 / 10
    expect(screen.getByText(/가정선 \$0\.02/)).toBeInTheDocument()
  })
})
