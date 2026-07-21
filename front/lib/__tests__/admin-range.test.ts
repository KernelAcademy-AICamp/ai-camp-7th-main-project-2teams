import { describe, it, expect } from 'vitest'
import { parseRange, rangeToInterval, RANGE_DAYS, ADMIN_RANGES } from '../admin-range'

describe('admin-range', () => {
  it('유효한 range는 그대로', () => {
    expect(parseRange('1d')).toBe('1d')
    expect(parseRange('30d')).toBe('30d')
  })

  it('무효/누락은 7d 기본', () => {
    expect(parseRange(null)).toBe('7d')
    expect(parseRange('999d')).toBe('7d')
  })

  it('interval 문자열 매핑', () => {
    expect(rangeToInterval('1d')).toBe('1 day')
    expect(rangeToInterval('7d')).toBe('7 days')
    expect(rangeToInterval('30d')).toBe('30 days')
  })

  it('일수 매핑', () => {
    expect(RANGE_DAYS['30d']).toBe(30)
  })

  it('탭 목록은 3종', () => {
    expect(ADMIN_RANGES).toEqual(['1d', '7d', '30d'])
  })
})
