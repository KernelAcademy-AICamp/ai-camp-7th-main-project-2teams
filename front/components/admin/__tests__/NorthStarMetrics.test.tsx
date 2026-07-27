// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { NorthStarMetrics, type WeeklyMetric, type PerUserDot } from '../NorthStarMetrics'

// 8주 축은 metrics가 제공 — 도트는 여기에 얹힌다. JS toISOString 포맷('.000Z')
const WEEKS = ['2026-07-13T00:00:00.000Z', '2026-07-20T00:00:00.000Z']

function metric(week: string, retrieved: number): WeeklyMetric {
  return {
    week,
    newSaves: 1,
    autoCoverage: 1,
    searchSuccess: 1,
    activeCurators: 1,
    retrieved,
    manualRetags: 0,
  }
}

function mockMetricsApi(
  perUser: PerUserDot[],
  metrics: WeeklyMetric[] = WEEKS.map((w) => metric(w, 3)),
) {
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ metrics, perUser }), { status: 200 }),
  )
}

// 표 뷰(details > table)에서 유저 행의 셀 값을 읽는다 — 차트 SVG 대신 접근 가능한 표로 검증
async function rowCells(user: string): Promise<string[]> {
  const cell = await screen.findByRole('rowheader', { name: user })
  const row = cell.closest('tr') as HTMLTableRowElement
  return within(row)
    .getAllByRole('cell')
    .map((td) => td.textContent ?? '')
}

describe('NorthStarMetrics · 유저별 되찾기 도트', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('RPC 주차 포맷(T00:00:00Z)이 metrics 주차(.000Z)와 달라도 매칭된다', async () => {
    // 서버 RPC는 '2026-07-20T00:00:00Z', metrics 축은 '...T00:00:00.000Z' — 문자열 비교로는 불일치.
    // 라벨(월/일) 매칭이 깨지면 값이 전부 0이 되어 조용히 빈 그래프가 된다(#306).
    mockMetricsApi([
      { week: '2026-07-13T00:00:00Z', user: 'U1', count: 2 },
      { week: '2026-07-20T00:00:00Z', user: 'U1', count: 5 },
    ])
    render(<NorthStarMetrics />)

    // [지난 주, 이번 주, 증감, 8주 합계]
    expect(await rowCells('U1')).toEqual(['2', '5', '+3', '7'])
  })

  it('데이터 없으면 도트 섹션 자체를 렌더하지 않는다', async () => {
    mockMetricsApi([])
    render(<NorthStarMetrics />)

    // 지표 타일은 뜨지만 도트 섹션은 없음
    expect(await screen.findByText('★ 주간 되찾은 북마크')).toBeInTheDocument()
    expect(screen.queryByText(/유저별 되찾기/)).not.toBeInTheDocument()
  })

  it('단일 사용자 — 한 행만 렌더', async () => {
    mockMetricsApi([{ week: WEEKS[1], user: 'U1', count: 4 }])
    render(<NorthStarMetrics />)

    expect(await rowCells('U1')).toEqual(['0', '4', '+4', '4'])
    expect(screen.queryByRole('rowheader', { name: 'U2' })).not.toBeInTheDocument()
    expect(screen.queryByRole('rowheader', { name: '기타' })).not.toBeInTheDocument()
  })

  it('3인 이상 — 3순위 이하는 기타 행으로 묶여 렌더', async () => {
    mockMetricsApi([
      { week: WEEKS[0], user: 'U1', count: 3 },
      { week: WEEKS[1], user: 'U1', count: 1 },
      { week: WEEKS[1], user: 'U2', count: 2 },
      { week: WEEKS[1], user: '기타', count: 6 },
    ])
    render(<NorthStarMetrics />)

    expect(await rowCells('U1')).toEqual(['3', '1', '-2', '4'])
    expect(await rowCells('U2')).toEqual(['0', '2', '+2', '2'])
    expect(await rowCells('기타')).toEqual(['0', '6', '+6', '6'])
  })

  it('축에 없는 주차의 도트는 8주 합계에 포함되지 않는다', async () => {
    // 8주 창 밖(2026-06-01) 값이 합계에 새면 "8주 N건"이 축과 어긋난다
    mockMetricsApi([
      { week: '2026-06-01T00:00:00Z', user: 'U1', count: 99 },
      { week: WEEKS[1], user: 'U1', count: 1 },
    ])
    render(<NorthStarMetrics />)

    expect(await rowCells('U1')).toEqual(['0', '1', '+1', '1'])
  })

  it('API 실패 시 에러 문구, 도트 없음', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }))
    render(<NorthStarMetrics />)

    expect(await screen.findByText('North Star 지표를 불러오지 못했습니다')).toBeInTheDocument()
    expect(screen.queryByText(/유저별 되찾기/)).not.toBeInTheDocument()
  })
})
