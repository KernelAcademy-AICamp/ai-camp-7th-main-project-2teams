// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { BarList } from '../BarList'

const data = [
  { label: '개발', value: 30, pct: 0.75 },
  { label: '여행', value: 10, pct: 0.25 },
]

describe('BarList', () => {
  it('각 항목 라벨·건수·비율 렌더', () => {
    render(<BarList data={data} />)
    expect(screen.getByText('개발')).toBeInTheDocument()
    expect(screen.getByText('30건 (75%)')).toBeInTheDocument()
    expect(screen.getByText('10건 (25%)')).toBeInTheDocument()
  })

  it('데이터 없으면 안내 문구', () => {
    render(<BarList data={[]} />)
    expect(screen.getByText('데이터 없음')).toBeInTheDocument()
  })

  it('onSelect 있으면 라벨 클릭 시 콜백', () => {
    const onSelect = vi.fn()
    render(<BarList data={data} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: '개발' }))
    expect(onSelect).toHaveBeenCalledWith('개발')
  })
})
