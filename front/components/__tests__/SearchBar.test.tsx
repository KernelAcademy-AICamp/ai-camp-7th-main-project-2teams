// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchBar } from '../SearchBar'

// 검색 트리거를 debounce 자동검색에서 명시적 submit(검색 버튼 · Enter)으로 바꾼 뒤의 계약.
// 이전 테스트가 막던 회귀(탭 전환 시 옛 검색어 부활 · 마운트 직후 onClear)는 value를 보는
// 이펙트 자체가 사라져 구조적으로 발생할 수 없다 — 그래서 그 케이스는 승계하지 않는다.

const RECENT_KEY = 'mowaba:recent-searches'

function setup(value = '') {
  const onSearch = vi.fn()
  const onClear = vi.fn()
  const onChange = vi.fn()
  const utils = render(
    <SearchBar value={value} onChange={onChange} onSearch={onSearch} onClear={onClear} />,
  )
  const input = screen.getByLabelText('북마크 검색') as HTMLInputElement
  return {
    onSearch,
    onClear,
    onChange,
    input,
    form: input.closest('form') as HTMLFormElement,
    ...utils,
  }
}

describe('SearchBar 검색 트리거', () => {
  beforeEach(() => localStorage.clear())

  it('타이핑만으로는 검색하지 않음', () => {
    const { onSearch, onClear, input } = setup('')
    fireEvent.change(input, { target: { value: '리액트' } })
    expect(onSearch).not.toHaveBeenCalled()
    expect(onClear).not.toHaveBeenCalled()
  })

  it('Enter(폼 submit) 시 검색', () => {
    const { onSearch, form } = setup('리액트 훅')
    fireEvent.submit(form)
    expect(onSearch).toHaveBeenCalledWith('리액트 훅')
  })

  it('검색 버튼 클릭 시 검색', () => {
    const { onSearch } = setup('피그마')
    fireEvent.click(screen.getByLabelText('검색'))
    expect(onSearch).toHaveBeenCalledWith('피그마')
  })

  it('앞뒤 공백은 잘라서 검색', () => {
    const { onSearch, form } = setup('  리액트  ')
    fireEvent.submit(form)
    expect(onSearch).toHaveBeenCalledWith('리액트')
  })

  it('빈 값으로 submit하면 검색이 아니라 onClear', () => {
    const { onSearch, onClear, form } = setup('   ')
    fireEvent.submit(form)
    expect(onSearch).not.toHaveBeenCalled()
    expect(onClear).toHaveBeenCalled()
  })

  // 지우기 버튼은 form 안에 있어 type을 명시하지 않으면 기본값 submit — 지우자마자 검색이 돈다.
  it('지우기 버튼은 검색을 트리거하지 않음', () => {
    const { onSearch, onClear, onChange } = setup('리액트')
    const clearBtn = screen.getByLabelText('검색어 지우기')
    expect(clearBtn.getAttribute('type')).toBe('button')

    fireEvent.click(clearBtn)
    expect(onChange).toHaveBeenCalledWith('')
    expect(onClear).toHaveBeenCalled()
    expect(onSearch).not.toHaveBeenCalled()
  })
})

describe('SearchBar 최근 검색', () => {
  beforeEach(() => localStorage.clear())

  it('타이핑만 하고 검색하지 않으면 기록하지 않음', () => {
    const { input } = setup('')
    fireEvent.change(input, { target: { value: '검색 안 한 문자열' } })
    expect(localStorage.getItem(RECENT_KEY)).toBeNull()
  })

  it('실제로 검색한 것만 기록', () => {
    const { form } = setup('리액트')
    fireEvent.submit(form)
    expect(JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')).toEqual(['리액트'])
  })

  it('최근 검색 칩을 누르면 즉시 검색', () => {
    localStorage.setItem(RECENT_KEY, JSON.stringify(['피그마']))
    const { onSearch, onChange } = setup('')
    fireEvent.click(screen.getByRole('button', { name: '피그마' }))
    expect(onChange).toHaveBeenCalledWith('피그마')
    expect(onSearch).toHaveBeenCalledWith('피그마')
  })
})

describe('SearchBar 아이콘 중복 방지', () => {
  // type=search는 브라우저가 기본 지우기 버튼(::-webkit-search-cancel-button)을 그린다.
  // 커스텀 X와 겹쳐 X가 두 개로 보이던 문제 — appearance-none으로 네이티브 쪽을 없앤다.
  it('네이티브 지우기 버튼을 숨기는 클래스가 붙어 있음', () => {
    const { input } = setup('리액트')
    expect(input.className).toContain('[&::-webkit-search-cancel-button]:appearance-none')
  })

  it('값이 없으면 지우기 버튼 미노출', () => {
    setup('')
    expect(screen.queryByLabelText('검색어 지우기')).toBeNull()
  })

  it('값이 있으면 지우기 버튼은 하나만', () => {
    setup('리액트')
    expect(screen.getAllByLabelText('검색어 지우기')).toHaveLength(1)
  })
})
