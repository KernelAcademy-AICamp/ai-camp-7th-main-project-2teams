import { describe, it, expect } from 'vitest'
import { isSafeHttpUrl } from '../ssrf'

describe('isSafeHttpUrl', () => {
  it('일반 https URL → true', () => {
    expect(isSafeHttpUrl('https://example.com/image.jpg')).toBe(true)
  })

  it('http URL → true', () => {
    expect(isSafeHttpUrl('http://example.com/image.jpg')).toBe(true)
  })

  it('file: 프로토콜 → false', () => {
    expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false)
  })

  it('localhost → false', () => {
    expect(isSafeHttpUrl('http://localhost:3000/x')).toBe(false)
  })

  it('루프백(127.0.0.1) → false', () => {
    expect(isSafeHttpUrl('http://127.0.0.1/x')).toBe(false)
  })

  it('사설망(10.x, 192.168.x, 172.16-31.x) → false', () => {
    expect(isSafeHttpUrl('http://10.0.0.1/x')).toBe(false)
    expect(isSafeHttpUrl('http://192.168.1.1/x')).toBe(false)
    expect(isSafeHttpUrl('http://172.16.0.1/x')).toBe(false)
  })

  it('클라우드 메타데이터 링크로컬(169.254.169.254) → false', () => {
    expect(isSafeHttpUrl('http://169.254.169.254/latest/meta-data')).toBe(false)
  })

  it('잘못된 URL 문자열 → false', () => {
    expect(isSafeHttpUrl('not-a-url')).toBe(false)
  })
})
