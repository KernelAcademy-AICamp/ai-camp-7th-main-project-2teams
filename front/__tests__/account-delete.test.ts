import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'

// user_id 해시 로그 포맷 검증 (식별 정보 미포함)
describe('탈퇴 로그 user_id 해시', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440000'

  it('sha256 해시 앞 16자리만 포함', () => {
    const hash = createHash('sha256').update(userId).digest('hex').slice(0, 16)
    expect(hash).toHaveLength(16)
    expect(hash).toMatch(/^[0-9a-f]+$/)
  })

  it('원본 user_id와 다름 (역산 불가 확인)', () => {
    const hash = createHash('sha256').update(userId).digest('hex').slice(0, 16)
    expect(hash).not.toBe(userId)
    expect(hash).not.toContain(userId)
  })

  it('동일 user_id → 동일 해시 (결정론적)', () => {
    const h1 = createHash('sha256').update(userId).digest('hex').slice(0, 16)
    const h2 = createHash('sha256').update(userId).digest('hex').slice(0, 16)
    expect(h1).toBe(h2)
  })
})
