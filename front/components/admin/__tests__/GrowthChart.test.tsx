// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { GrowthChart, type GrowthPoint } from '../GrowthChart'

const data: GrowthPoint[] = [
  { bucket: '2026-07-14T00:00:00Z', signups: 2, saves: 10 },
  { bucket: '2026-07-15T00:00:00Z', signups: 1, saves: 8 },
]

describe('GrowthChart', () => {
  it('제목·범례 렌더', () => {
    // jsdom에서 recharts ResponsiveContainer가 0px 크기로 렌더되어
    // Legend가 실제로 마운트되지 않음 — 항상 렌더되는 sr-only 요약으로 대체 검증.
    render(<GrowthChart data={data} />)
    expect(screen.getByText('성장 추이')).toBeInTheDocument()
    expect(screen.getByText(/신규 가입/)).toBeInTheDocument()
    expect(screen.getByText(/저장/)).toBeInTheDocument()
  })

  it('데이터 없으면 안내 문구', () => {
    render(<GrowthChart data={[]} />)
    expect(screen.getByText('데이터 없음')).toBeInTheDocument()
  })
})
