// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { HealthStats } from '../HealthStats'

describe('HealthStats', () => {
  it('데드링크·미분류 비율 % 렌더', () => {
    render(<HealthStats deadRatio={0.12} uncategorizedRatio={0.3} />)
    expect(screen.getByText('12%')).toBeInTheDocument()
    expect(screen.getByText('30%')).toBeInTheDocument()
    expect(screen.getByText('데드링크')).toBeInTheDocument()
    expect(screen.getByText('미분류')).toBeInTheDocument()
  })
})
