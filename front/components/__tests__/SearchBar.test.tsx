// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { SearchBar } from '../SearchBar'

// 탭 전환 시 부모(page.tsx)의 handleSearch/handleClear는 tab이 deps라 아이덴티티가 바뀐다.
// 그 재실행이 debounce에 남은 옛 검색어로 onSearch를 부르면 비운 입력창이 되살아난다(회귀 방지).

const DEBOUNCE_MS = 300

describe('SearchBar debounce 가드', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

  it('debounce 정착 후 onSearch 호출', () => {
    const onSearch = vi.fn()
    const onClear = vi.fn()

    const { rerender } = render(
      <SearchBar value="" onChange={() => {}} onSearch={onSearch} onClear={onClear} />,
    )
    rerender(<SearchBar value="리액트" onChange={() => {}} onSearch={onSearch} onClear={onClear} />)
    advance(DEBOUNCE_MS)

    expect(onSearch).toHaveBeenCalledWith('리액트')
  })

  it('탭 전환(value 초기화 + 콜백 아이덴티티 변경) 시 옛 검색어로 재검색하지 않음', () => {
    const onClear = vi.fn()
    const onSearch = vi.fn()

    const { rerender } = render(
      <SearchBar value="" onChange={() => {}} onSearch={onSearch} onClear={onClear} />,
    )
    rerender(<SearchBar value="리액트" onChange={() => {}} onSearch={onSearch} onClear={onClear} />)
    advance(DEBOUNCE_MS)
    expect(onSearch).toHaveBeenCalledTimes(1)

    // 탭 클릭: 부모가 searchQuery를 비우고, 새 콜백 아이덴티티를 내려보낸다
    rerender(
      <SearchBar
        value=""
        onChange={() => {}}
        onSearch={(q) => onSearch(q)}
        onClear={() => onClear()}
      />,
    )

    // debounce 미정착 구간 — 옛 검색어로 재검색 금지
    expect(onSearch).toHaveBeenCalledTimes(1)
    expect((screen.getByLabelText('북마크 검색') as HTMLInputElement).value).toBe('')

    // debounce 정착 후에는 빈 문자열이므로 onClear
    advance(DEBOUNCE_MS)
    expect(onSearch).toHaveBeenCalledTimes(1)
    expect(onClear).toHaveBeenCalled()
  })

  it('마운트 직후에는 onClear를 호출하지 않음', () => {
    const onClear = vi.fn()

    render(<SearchBar value="" onChange={() => {}} onSearch={vi.fn()} onClear={onClear} />)
    advance(DEBOUNCE_MS)

    expect(onClear).not.toHaveBeenCalled()
  })
})
