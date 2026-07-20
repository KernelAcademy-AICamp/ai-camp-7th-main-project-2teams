// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { TrendingTags, type TrendingTag } from '../TrendingTags'

const data: TrendingTag[] = [
  { tag: 'AI', count: 12, prevCount: 4 },
  { tag: 'React', count: 5, prevCount: 5 },
]

describe('TrendingTags', () => {
  it('태그·delta 렌더', () => {
    render(<TrendingTags data={data} />)
    expect(screen.getByText('AI')).toBeInTheDocument()
    expect(screen.getByText('+8')).toBeInTheDocument() // 12-4
    expect(screen.getByText('0')).toBeInTheDocument() // 5-5
  })

  it('데이터 없으면 안내', () => {
    render(<TrendingTags data={[]} />)
    expect(screen.getByText('데이터 없음')).toBeInTheDocument()
  })
})
