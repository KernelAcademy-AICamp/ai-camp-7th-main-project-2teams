import { describe, it, expect } from 'vitest'
import { extractYoutubeId } from '../youtube'

describe('extractYoutubeId', () => {
  it('watch?v= 형식', () => {
    expect(extractYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('youtu.be 단축 링크', () => {
    expect(extractYoutubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('타임스탬프 등 부가 파라미터 포함 시에도 ID 추출', () => {
    expect(extractYoutubeId('https://youtube.com/watch?v=dQw4w9WgXcQ&t=10s')).toBe('dQw4w9WgXcQ')
    expect(extractYoutubeId('https://m.youtube.com/watch?list=x&v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('embed, shorts 형식', () => {
    expect(extractYoutubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extractYoutubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('유튜브 링크 아니면 null', () => {
    expect(extractYoutubeId('https://vimeo.com/12345')).toBeNull()
    expect(extractYoutubeId('not a url')).toBeNull()
  })
})
