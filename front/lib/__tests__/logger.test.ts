import { describe, it, expect } from 'vitest'
import { maskSensitive } from '@/lib/logger'

describe('maskSensitive', () => {
  it('content 키 제거', () => {
    const result = maskSensitive({
      title: 'test',
      url: 'https://example.com',
      content: '본문내용',
    })
    expect(result).not.toHaveProperty('content')
    expect(result).toMatchObject({ title: 'test', url: 'https://example.com' })
  })

  it('content 없는 객체 통과', () => {
    const obj = { title: 'test', url: 'https://example.com' }
    expect(maskSensitive(obj)).toEqual(obj)
  })

  it('빈 객체 통과', () => {
    expect(maskSensitive({})).toEqual({})
  })

  it('원본 객체 불변 — content 제거 후에도 원본 유지', () => {
    const obj = { content: '민감', title: 'test' } as Record<string, unknown>
    maskSensitive(obj)
    expect(obj).toHaveProperty('content')
  })
})
