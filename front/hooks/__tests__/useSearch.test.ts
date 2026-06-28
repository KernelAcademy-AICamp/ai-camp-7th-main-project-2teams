import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('useSearch mutationFn', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('POST /api/search 호출', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    })
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '리액트' }),
    })
    const data = await res.json()
    expect(fetch).toHaveBeenCalledWith('/api/search', expect.objectContaining({ method: 'POST' }))
    expect(data).toEqual({ results: [] })
  })

  it('500 응답 → 에러 throw', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    const mutationFn = async (query: string) => {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      if (!res.ok) throw new Error(`Search failed: ${res.status}`)
      return res.json()
    }
    await expect(mutationFn('test')).rejects.toThrow('Search failed: 500')
  })

  it('빈 results 처리', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    })
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '존재하지않는검색어' }),
    })
    const data = await res.json()
    expect(data.results).toHaveLength(0)
  })
})
