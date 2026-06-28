import { describe, it, expect } from 'vitest'

// showToast 상태 → DOM 표현 매핑 순수 로직 테스트
function toastContent(state) {
  if (state.type === 'loading') return { text: '저장 중...', autoClose: false }

  if (state.type === 'success') {
    const category = state.bookmark?.category_id ? `[${state.bookmark.category_id}] ` : ''
    const tags = state.bookmark?.tags?.length ? state.bookmark.tags.join(' · ') : '태그 없음'
    return { text: `${category}${tags}`, autoClose: true }
  }

  if (state.type === 'error') {
    return { text: `오류: ${state.message}`, autoClose: true }
  }

  return { text: '', autoClose: false }
}

describe('토스트 콘텐츠 로직', () => {
  it('loading → 저장 중... (자동 닫힘 없음)', () => {
    expect(toastContent({ type: 'loading' })).toEqual({ text: '저장 중...', autoClose: false })
  })

  it('success + 태그/카테고리 → 포맷 출력', () => {
    const { text, autoClose } = toastContent({
      type: 'success',
      bookmark: { category_id: '개발', tags: ['JavaScript', 'React'] },
    })
    expect(text).toBe('[개발] JavaScript · React')
    expect(autoClose).toBe(true)
  })

  it('success + 태그 없음 → "태그 없음"', () => {
    const { text } = toastContent({ type: 'success', bookmark: { tags: [] } })
    expect(text).toBe('태그 없음')
  })

  it('success + category 없음 → 카테고리 생략', () => {
    const { text } = toastContent({
      type: 'success',
      bookmark: { tags: ['AI'] },
    })
    expect(text).toBe('AI')
  })

  it('error → 오류 메시지 + 자동 닫힘', () => {
    const { text, autoClose } = toastContent({ type: 'error', message: 'HTTP 500' })
    expect(text).toBe('오류: HTTP 500')
    expect(autoClose).toBe(true)
  })
})
