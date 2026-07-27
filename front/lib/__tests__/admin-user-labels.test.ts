import { describe, it, expect } from 'vitest'
import {
  dotColor,
  labelOf,
  labelOrder,
  labelUsersByCost,
  COST_PER_SAVE_USD,
  COST_PER_SEARCH_USD,
  estimateCostUsd,
} from '../admin-user-labels'

describe('labelUsersByCost', () => {
  it('비용 내림차순으로 U1·U2, 3순위 이하는 기타', () => {
    // a: 저장 2건, b: 저장 1+검색 1, c·d: 검색 1건
    const labels = labelUsersByCost([
      { user_id: 'a', type: 'bookmark_saved' },
      { user_id: 'a', type: 'bookmark_saved' },
      { user_id: 'b', type: 'bookmark_saved' },
      { user_id: 'b', type: 'search_performed' },
      { user_id: 'c', type: 'search_performed' },
      { user_id: 'd', type: 'search_performed' },
    ])
    expect(labels.get('a')).toBe('U1')
    expect(labels.get('b')).toBe('U2')
    expect(labels.get('c')).toBe('기타')
    expect(labels.get('d')).toBe('기타')
  })

  it('검색만 많은 사용자보다 저장 사용자가 상위 (단가 반영)', () => {
    const searchesToBeat = Math.ceil(COST_PER_SAVE_USD / COST_PER_SEARCH_USD) - 1
    const labels = labelUsersByCost([
      { user_id: 'saver', type: 'bookmark_saved' },
      ...Array.from({ length: searchesToBeat }, () => ({
        user_id: 'searcher',
        type: 'search_performed',
      })),
    ])
    expect(labels.get('saver')).toBe('U1')
    expect(labels.get('searcher')).toBe('U2')
  })

  it('동률이면 user_id 오름차순 — 호출마다 라벨이 흔들리지 않음', () => {
    const events = [
      { user_id: 'zeta', type: 'bookmark_saved' },
      { user_id: 'alpha', type: 'bookmark_saved' },
    ]
    expect(labelUsersByCost(events).get('alpha')).toBe('U1')
    // 입력 순서를 뒤집어도 같은 결과
    expect(labelUsersByCost([...events].reverse()).get('alpha')).toBe('U1')
  })

  it('빈 입력 → 빈 매핑', () => {
    expect(labelUsersByCost([]).size).toBe(0)
  })
})

describe('labelOf', () => {
  it('매핑에 없는 user_id는 기타로 흡수', () => {
    expect(labelOf(new Map([['a', 'U1']]), 'unknown')).toBe('기타')
  })
})

describe('labelOrder', () => {
  it('U1 → U2 → 기타 순', () => {
    expect(['기타', 'U2', 'U1'].sort((a, b) => labelOrder(a) - labelOrder(b))).toEqual([
      'U1',
      'U2',
      '기타',
    ])
  })
})

describe('dotColor', () => {
  it('키별 고정 색, 미지의 라벨은 기타 색', () => {
    expect(dotColor('U1')).toBe('#4a90e2')
    expect(dotColor('U2')).toBe('#e8833a')
    expect(dotColor('기타')).toBe('#9aa0a8')
    expect(dotColor('U9')).toBe(dotColor('기타'))
  })
})

describe('estimateCostUsd', () => {
  it('저장·검색 단가 합산', () => {
    expect(estimateCostUsd(3, 1)).toBeCloseTo(3 * COST_PER_SAVE_USD + COST_PER_SEARCH_USD)
  })
})
