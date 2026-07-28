// @vitest-environment jsdom
// renderHook은 DOM이 필요하다 — 이 파일의 나머지 순수 함수 테스트도 jsdom에서 그대로 돈다.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { fetchImportBookmarks, formatFileSize, useImportBookmarks } from '../useImportBookmarks'

// SSE 이벤트 배열을 fetch 응답의 body(ReadableStream 유사 객체)로 변환 — 테스트용
function makeSSEBody(events: Array<Record<string, unknown>>) {
  const chunks = events.map((e) => `data: ${JSON.stringify(e)}\n\n`)
  const encoder = new TextEncoder()
  let i = 0
  return {
    getReader: () => ({
      read: async () => {
        if (i >= chunks.length) return { done: true, value: undefined }
        const value = encoder.encode(chunks[i])
        i++
        return { done: false, value }
      },
    }),
  }
}

// ----------------------------------------------------------------
// (1) formatFileSize — 순수 함수 단위 테스트
// ----------------------------------------------------------------
describe('formatFileSize', () => {
  it('1024 미만: B 단위 반환', () => {
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(1023)).toBe('1023 B')
  })

  it('1024 이상 1MB 미만: KB 단위 반환 (소수점 1자리)', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(1024 * 1023)).toBe('1023.0 KB')
  })

  it('1MB 이상: MB 단위 반환 (소수점 1자리)', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB')
    expect(formatFileSize(1024 * 1024 * 2.5)).toBe('2.5 MB')
    expect(formatFileSize(1024 * 1024 * 10)).toBe('10.0 MB')
  })
})

// ----------------------------------------------------------------
// (2) fetchImportBookmarks — fetch mock으로 엔드포인트·body 검증
// ----------------------------------------------------------------
describe('fetchImportBookmarks', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('POST /api/bookmarks/import 를 FormData body로 호출', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: makeSSEBody([{ type: 'done', imported: 3, failed: 0, skipped: 1, duplicate: 0 }]),
    })

    const formData = new FormData()
    formData.append('file', new Blob(['<html>'], { type: 'text/html' }), 'bookmarks.html')

    await fetchImportBookmarks(formData)

    expect(fetch).toHaveBeenCalledWith('/api/bookmarks/import', {
      method: 'POST',
      body: formData,
    })
  })

  it('Content-Type 헤더를 수동 설정하지 않음 (브라우저가 자동 설정)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: makeSSEBody([{ type: 'done', imported: 1, failed: 0, skipped: 0, duplicate: 0 }]),
    })

    const formData = new FormData()
    await fetchImportBookmarks(formData)

    const callArgs = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
    // headers 키 자체가 없거나 Content-Type 미포함
    const headers = callArgs.headers as Record<string, string> | undefined
    expect(headers?.['Content-Type']).toBeUndefined()
  })

  it('성공 응답: done 이벤트 값을 ImportResult로 반환', async () => {
    const expected = { imported: 5, failed: 2, skipped: 1, duplicate: 3, failedItems: [] }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: makeSSEBody([{ type: 'done', ...expected }]),
    })

    const result = await fetchImportBookmarks(new FormData())
    expect(result).toEqual(expected)
  })

  it('A61: done 이벤트의 failedItems를 ImportResult에 그대로 전달', async () => {
    const failedItems = [
      { url: 'https://broken.com/', reason: '임베딩 생성 실패' },
      { url: 'https://fail.com/', reason: '저장 실패' },
    ]
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: makeSSEBody([
        { type: 'done', imported: 1, failed: 2, skipped: 0, duplicate: 0, failedItems },
      ]),
    })

    const result = await fetchImportBookmarks(new FormData())
    expect(result.failedItems).toEqual(failedItems)
  })

  it('A61: failedItems가 빈 배열인 경우도 그대로 전달', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: makeSSEBody([
        { type: 'done', imported: 2, failed: 0, skipped: 0, duplicate: 0, failedItems: [] },
      ]),
    })

    const result = await fetchImportBookmarks(new FormData())
    expect(result.failedItems).toEqual([])
  })

  it('400 응답 (JSON error 없음) → HTML 파일 타입 fallback 메시지 throw', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({}), // error 필드 없음
    })

    await expect(fetchImportBookmarks(new FormData())).rejects.toThrow(
      'HTML(.html) 또는 CSV(.csv) 파일만 업로드할 수 있습니다.'
    )
  })

  it('400 응답 + JSON error → 서버 메시지 우선 throw', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: '지원하지 않는 북마크 형식입니다.' }),
    })

    await expect(fetchImportBookmarks(new FormData())).rejects.toThrow(
      '지원하지 않는 북마크 형식입니다.'
    )
  })

  it('413 응답 → 파일 크기 초과 에러 메시지 throw (5MB 표기)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 413 })

    await expect(fetchImportBookmarks(new FormData())).rejects.toThrow(
      '파일 크기가 너무 큽니다. 5MB 이하로 업로드해주세요.'
    )
  })

  it('500 응답 + JSON error 필드 → 서버 메시지 포함 throw', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: '서버 내부 오류' }),
    })

    await expect(fetchImportBookmarks(new FormData())).rejects.toThrow('서버 내부 오류')
  })

  it('500 응답 + JSON 파싱 실패 → 기본 에러 메시지 throw', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new SyntaxError('invalid json') },
    })

    await expect(fetchImportBookmarks(new FormData())).rejects.toThrow('업로드 실패 (500)')
  })

  it('progress 이벤트마다 onProgress 콜백 호출, 최종 resolve 값은 done 이벤트', async () => {
    const progressEvents = [
      { type: 'progress', total: 2, done: 1, imported: 1, duplicate: 0, failed: 0, skipped: 0 },
      { type: 'progress', total: 2, done: 2, imported: 2, duplicate: 0, failed: 0, skipped: 0 },
    ]
    const doneEvent = { type: 'done', imported: 2, failed: 0, skipped: 0, duplicate: 0, failedItems: [] }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: makeSSEBody([...progressEvents, doneEvent]),
    })

    const onProgress = vi.fn()
    const result = await fetchImportBookmarks(new FormData(), onProgress)

    expect(onProgress).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenNthCalledWith(1, progressEvents[0])
    expect(onProgress).toHaveBeenNthCalledWith(2, progressEvents[1])
    expect(result).toEqual({ imported: 2, failed: 0, skipped: 0, duplicate: 0, failedItems: [] })
  })

  it('error 이벤트 수신 시 해당 메시지로 reject', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: makeSSEBody([{ type: 'error', message: '문제 발생' }]),
    })

    await expect(fetchImportBookmarks(new FormData())).rejects.toThrow('문제 발생')
  })

  it('done/error 이벤트 없이 스트림 종료 → 연결 끊김 에러 throw', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: makeSSEBody([]),
    })

    await expect(fetchImportBookmarks(new FormData())).rejects.toThrow(
      '업로드 중 연결이 끊겼습니다. 다시 시도해주세요.',
    )
  })
})

// ----------------------------------------------------------------
// (3) onSuccess invalidate 검증 — 실제 훅을 렌더해서 확인한다.
//     이전 버전은 훅을 렌더하지 않고 queryClient.invalidateQueries를 직접 호출한 뒤
//     그 스파이를 확인해, onSuccess가 실제로 도는지는 전혀 검증하지 못했다.
// ----------------------------------------------------------------
function makeWrapper(queryClient: QueryClient) {
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  Wrapper.displayName = 'TestQueryClientProvider'
  return Wrapper
}

function mockDoneResponse() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    body: makeSSEBody([
      { type: 'done', imported: 1, failed: 0, skipped: 0, duplicate: 0, failedItems: [] },
    ]),
  }) as unknown as typeof fetch
}

describe('useImportBookmarks onSuccess — invalidateQueries 검증', () => {
  it('성공 시 bookmarks·folders·categories 세 키를 모두 invalidate', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    mockDoneResponse()

    const { result } = renderHook(() => useImportBookmarks(), {
      wrapper: makeWrapper(queryClient),
    })
    result.current.mutate({ formData: new FormData() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // bookmarks만 refetchType: 'all' — inactive(홈 목록)까지 즉시 다시 받아야
    // 홈 복귀 시 재마운트 refetch 여부와 무관하게 최신 목록이 보인다.
    expect(spy).toHaveBeenCalledWith({ queryKey: ['bookmarks'], refetchType: 'all' })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['folders'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['categories'] })
  })

  it('inactive 상태의 홈 목록 쿼리를 즉시 refetch한다 (stale 표시만 하지 않음)', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const listKey = ['bookmarks', {}]
    queryClient.setQueryData(listKey, { pages: [{ bookmarks: [], total: 0 }], pageParams: [1] })

    const refetchSpy = vi.spyOn(queryClient, 'refetchQueries')
    mockDoneResponse()

    const { result } = renderHook(() => useImportBookmarks(), {
      wrapper: makeWrapper(queryClient),
    })
    result.current.mutate({ formData: new FormData() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(refetchSpy).toHaveBeenCalled()
  })

  // 사용자 재현 시나리오: /import에 있는 동안 홈 목록 쿼리는 inactive다.
  // invalidate가 inactive 쿼리까지 stale로 만들어야 홈 복귀(재마운트) 때 refetch가 돈다.
  it('언마운트되어 inactive인 bookmarks 쿼리도 invalidate 후 stale로 표시된다', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const listKey = [
      'bookmarks',
      { category: undefined, folder: undefined, tag: undefined, tab: undefined },
    ]
    queryClient.setQueryData(listKey, { pages: [{ bookmarks: [], total: 0 }], pageParams: [1] })
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(false)

    mockDoneResponse()
    const { result } = renderHook(() => useImportBookmarks(), {
      wrapper: makeWrapper(queryClient),
    })
    result.current.mutate({ formData: new FormData() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true)
  })
})
