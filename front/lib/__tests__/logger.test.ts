import { describe, it, expect, vi, beforeEach } from 'vitest'
import { maskSensitive, logger } from '@/lib/logger'

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

  it('embedding 키 제거', () => {
    const result = maskSensitive({ title: 'test', embedding: [0.1, 0.2, 0.3] })
    expect(result).not.toHaveProperty('embedding')
  })

  it('falsy content 값도 제거', () => {
    expect(maskSensitive({ content: null, title: 'a' } as Record<string, unknown>)).not.toHaveProperty('content')
    expect(maskSensitive({ content: 0, title: 'a' } as Record<string, unknown>)).not.toHaveProperty('content')
  })
})

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('객체 인자에서 content 자동 제거', () => {
    logger.log({ title: 'test', content: '본문', url: 'https://a.com' })
    const arg = (console.log as ReturnType<typeof vi.spyOn>).mock.calls[0][0]
    expect(arg).not.toHaveProperty('content')
    expect(arg).toMatchObject({ title: 'test', url: 'https://a.com' })
  })

  it('객체 인자에서 embedding 자동 제거', () => {
    logger.error({ title: 'x', embedding: [0.1, 0.2] })
    const arg = (console.error as ReturnType<typeof vi.spyOn>).mock.calls[0][0]
    expect(arg).not.toHaveProperty('embedding')
  })

  it('문자열 인자 그대로 통과', () => {
    logger.log('hello', 'world')
    expect(console.log).toHaveBeenCalledWith('hello', 'world')
  })

  it('배열 인자 그대로 통과', () => {
    const arr = [1, 2, 3]
    logger.warn(arr)
    expect(console.warn).toHaveBeenCalledWith(arr)
  })
})
