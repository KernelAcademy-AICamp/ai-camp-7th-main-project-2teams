import { describe, it, expect } from 'vitest'
import { serializeBackup, parseBackup } from '../retag-backup'

describe('retag-backup', () => {
  it('직렬화→파싱 라운드트립 — id·tags 보존', () => {
    const rows = [
      { id: 'a', tags: ['개발', 'React'] },
      { id: 'b', tags: [] }, // 빈 태그도 보존(복원 시 미분류 상태 복원)
    ]
    expect(parseBackup(serializeBackup(rows))).toEqual(rows)
  })

  it('배열 아니면 throw', () => {
    expect(() => parseBackup('{"id":"a"}')).toThrow('배열 아님')
  })

  it('{id, tags} 형식 아니면 throw', () => {
    expect(() => parseBackup('[{"id":"a"}]')).toThrow('{id, tags}')
    expect(() => parseBackup('[{"tags":[]}]')).toThrow('{id, tags}')
  })
})
