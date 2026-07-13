import { describe, it, expect } from 'vitest'
import {
  toFormState,
  addTag,
  removeTag,
  buildUpdatePayload,
  isTagCommitKey,
  tagLimitWarning,
} from '../EditBookmarkModal'

// A60: 카드 수정 모달 — 순수 로직만 테스트(렌더 테스트는 프로젝트 관례상 제외, AddBookmarkModal.test.ts 참고)
describe('toFormState', () => {
  it('bookmark.tags를 복사, category는 현재 소속 카테고리로 프리필, description은 원본 유지', () => {
    const form = toFormState({ tags: ['개발', 'React'], description: '메모', category: '개발' })
    expect(form).toEqual({ tags: ['개발', 'React'], category: '개발', description: '메모' })
  })

  it('category가 null(미분류)이면 빈 문자열로 프리필', () => {
    const form = toFormState({ tags: [], description: null, category: null })
    expect(form.category).toBe('')
  })

  it('description이 null이면 빈 문자열로 변환 (textarea 제어 컴포넌트용)', () => {
    const form = toFormState({ tags: [], description: null, category: null })
    expect(form.description).toBe('')
  })

  it('원본 tags 배열과 별개 참조 (불변성)', () => {
    const original = { tags: ['개발'], description: null, category: null }
    const form = toFormState(original)
    form.tags.push('추가됨')
    expect(original.tags).toEqual(['개발'])
  })
})

describe('addTag', () => {
  it('새 태그 추가', () => {
    expect(addTag(['개발'], 'React')).toEqual(['개발', 'React'])
  })

  it('앞뒤 공백 제거 후 추가', () => {
    expect(addTag([], '  React  ')).toEqual(['React'])
  })

  it('빈 문자열/공백만 입력 시 변경 없음', () => {
    expect(addTag(['개발'], '   ')).toEqual(['개발'])
    expect(addTag(['개발'], '')).toEqual(['개발'])
  })

  it('중복 태그는 추가하지 않음', () => {
    expect(addTag(['개발', 'React'], 'React')).toEqual(['개발', 'React'])
  })

  it('최대 2개 초과 시 추가하지 않음', () => {
    const tags = ['개발', 'React']
    expect(addTag(tags, '새태그')).toEqual(tags)
  })
})

describe('tagLimitWarning', () => {
  it('상한 미만이면 경고 없음', () => {
    expect(tagLimitWarning(['개발'], 'React')).toBeNull()
  })

  it('상한 도달 시 경고 문구 반환', () => {
    expect(tagLimitWarning(['개발', 'React'], '새태그')).toBe('태그는 최대 2개까지 추가할 수 있어요.')
  })

  it('상한 도달해도 빈 입력이면 경고 없음', () => {
    expect(tagLimitWarning(['개발', 'React'], '   ')).toBeNull()
  })

  it('상한 도달해도 중복 태그면 경고 없음(추가 자체가 안 일어나므로)', () => {
    expect(tagLimitWarning(['개발', 'React'], 'React')).toBeNull()
  })
})

describe('isTagCommitKey', () => {
  it('Enter, isComposing=false → 커밋', () => {
    expect(isTagCommitKey('Enter', false)).toBe(true)
  })

  it('쉼표, isComposing=false → 커밋', () => {
    expect(isTagCommitKey(',', false)).toBe(true)
  })

  it('한글 IME 조합 확정 Enter(isComposing=true) → 커밋 안 함 (중복 추가 버그 회귀 방지)', () => {
    expect(isTagCommitKey('Enter', true)).toBe(false)
  })

  it('Enter/쉼표가 아닌 키는 커밋 안 함', () => {
    expect(isTagCommitKey('a', false)).toBe(false)
  })
})

describe('removeTag', () => {
  it('지정 태그만 제거', () => {
    expect(removeTag(['개발', 'React', 'AI/ML'], 'React')).toEqual(['개발', 'AI/ML'])
  })

  it('존재하지 않는 태그 제거 시도 시 변경 없음', () => {
    expect(removeTag(['개발'], '없는태그')).toEqual(['개발'])
  })

  it('빈 배열에서 제거해도 에러 없이 빈 배열 반환', () => {
    expect(removeTag([], 'x')).toEqual([])
  })
})

describe('buildUpdatePayload', () => {
  const bookmark = { tags: ['개발'], description: '기존 메모', category: '개발' }

  it('아무 것도 안 바뀌면 null (불필요한 요청 방지)', () => {
    const form = { tags: ['개발'], category: '개발', description: '기존 메모' }
    expect(buildUpdatePayload(bookmark, form)).toBeNull()
  })

  it('tags만 변경 → tags만 payload에 포함', () => {
    const form = { tags: ['개발', 'React'], category: '개발', description: '기존 메모' }
    expect(buildUpdatePayload(bookmark, form)).toEqual({ tags: ['개발', 'React'] })
  })

  it('현재 카테고리와 다른 값 선택 → payload에 포함', () => {
    const form = { tags: ['개발'], category: '디자인', description: '기존 메모' }
    expect(buildUpdatePayload(bookmark, form)).toEqual({ category: '디자인' })
  })

  it('프리필된 현재 카테고리 그대로면(안 바뀜) payload 미포함', () => {
    const form = { tags: ['개발'], category: '개발', description: '기존 메모' }
    expect(buildUpdatePayload(bookmark, form)).toBeNull()
  })

  it('미분류(빈 값) 선택 시 category: null 전송 (카테고리 해제, 회귀 방지)', () => {
    const form = { tags: ['개발'], category: '', description: '기존 메모' }
    expect(buildUpdatePayload(bookmark, form)).toEqual({ category: null })
  })

  it('원본이 이미 미분류이고 폼도 미분류면 변경 없음 취급', () => {
    const unassignedBookmark = { tags: ['개발'], description: '기존 메모', category: null }
    const form = { tags: ['개발'], category: '', description: '기존 메모' }
    expect(buildUpdatePayload(unassignedBookmark, form)).toBeNull()
  })

  it('description 변경 → description만 포함', () => {
    const form = { tags: ['개발'], category: '개발', description: '새 메모' }
    expect(buildUpdatePayload(bookmark, form)).toEqual({ description: '새 메모' })
  })

  it('description을 빈 문자열로 바꾸면 null로 변환해서 전송 (삭제)', () => {
    const form = { tags: ['개발'], category: '개발', description: '' }
    expect(buildUpdatePayload(bookmark, form)).toEqual({ description: null })
  })

  it('여러 필드 동시 변경 → 모두 payload에 포함', () => {
    const form = { tags: ['백엔드'], category: '쇼핑', description: '수정됨' }
    expect(buildUpdatePayload(bookmark, form)).toEqual({
      tags: ['백엔드'],
      category: '쇼핑',
      description: '수정됨',
    })
  })

  it('원본 description이 null이고 폼도 빈 문자열이면 변경 없음 취급', () => {
    const noDescBookmark = { tags: [], description: null, category: null }
    const form = { tags: [], category: '', description: '' }
    expect(buildUpdatePayload(noDescBookmark, form)).toBeNull()
  })
})
