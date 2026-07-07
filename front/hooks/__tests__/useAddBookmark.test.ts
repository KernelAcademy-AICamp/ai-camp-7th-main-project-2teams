import { describe, it, expect, vi, beforeEach } from 'vitest'
import { postAddBookmark } from '../useAddBookmark'

// --- postAddBookmark 직접 검증 (A59: 409 중복 응답 duplicate 플래그 전달) ---
describe('postAddBookmark', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('성공 시 응답 JSON 그대로 반환', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bookmark: { id: 'b1' } }),
    })

    const result = await postAddBookmark({ url: 'https://example.com', title: 'Example' })

    expect(result).toEqual({ bookmark: { id: 'b1' } })
  })

  it('409 + duplicate:true 응답 → duplicate 플래그가 실린 Error throw', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: '이미 저장된 북마크입니다.', duplicate: true }),
    })

    await expect(
      postAddBookmark({ url: 'https://example.com', title: 'Example' })
    ).rejects.toMatchObject({
      message: '이미 저장된 북마크입니다.',
      duplicate: true,
    })
  })

  it('그 외 실패(500) → duplicate 플래그 없는 일반 Error throw', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: '서버 오류' }),
    })

    const err = await postAddBookmark({ url: 'https://example.com', title: 'Example' }).catch(
      (e) => e
    )

    expect(err.message).toBe('서버 오류')
    expect(err.duplicate).toBeUndefined()
  })

  it('에러 응답 바디 파싱 실패 시 상태코드 기반 기본 메시지', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => {
        throw new Error('parse fail')
      },
    })

    const err = await postAddBookmark({ url: 'https://example.com', title: 'Example' }).catch(
      (e) => e
    )

    expect(err.message).toBe('저장 실패 (400)')
    expect(err.duplicate).toBeUndefined()
  })
})
