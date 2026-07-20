// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { DonutChart } from '../DonutChart'

afterEach(cleanup)

describe('DonutChart', () => {
  it('빈 데이터는 안내 문구 표시', () => {
    render(<DonutChart data={[]} />)
    expect(screen.getByText('데이터 없음')).toBeInTheDocument()
  })

  it('범례에 라벨과 % 표시', () => {
    render(
      <DonutChart
        data={[
          { label: '개발', value: 30, pct: 0.75 },
          { label: '미분류', value: 10, pct: 0.25 },
        ]}
      />
    )
    expect(screen.getByText('개발')).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
  })
})
