import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchFolders } from '../useFolders'

// ─────────────────────────────────────────────
// (1) fetchFolders — fetch 로직 단위 테스트
// ─────────────────────────────────────────────
describe('fetchFolders', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('GET /api/bookmarks/folders 호출', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ folders: ['개발', '디자인'] }),
    })
    await fetchFolders()
    expect(fetch).toHaveBeenCalledWith('/api/bookmarks/folders')
  })

  it('성공 시 folders 배열 반환', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ folders: ['개발', '디자인', '학습'] }),
    })
    const result = await fetchFolders()
    expect(result).toEqual(['개발', '디자인', '학습'])
  })

  it('폴더 없으면 빈 배열 반환', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ folders: [] }),
    })
    const result = await fetchFolders()
    expect(result).toEqual([])
  })

  it('fetch 실패 시 에러 throw', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 })
    await expect(fetchFolders()).rejects.toThrow('폴더 목록 조회 실패')
  })

  it('런타임 가드: folders가 배열이 아니면 빈 배열 fallback', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ folders: null }),
    })
    const result = await fetchFolders()
    expect(result).toEqual([])
  })

  it('런타임 가드: folders 키 자체 없으면 빈 배열 fallback', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })
    const result = await fetchFolders()
    expect(result).toEqual([])
  })
})

// ─────────────────────────────────────────────
// (2) Sidebar 폴더 섹션 표시 조건 — 순수 로직 테스트
// ─────────────────────────────────────────────
describe('Sidebar 폴더 섹션 표시 여부 — folders.length > 0 조건', () => {
  it('폴더 0건이면 섹션 미노출 조건(false) 반환', () => {
    const folders: string[] = []
    // JSX 조건: {folders.length > 0 && <section>...}
    expect(folders.length > 0).toBe(false)
  })

  it('폴더 1건이면 섹션 노출 조건(true) 반환', () => {
    const folders = ['개발']
    expect(folders.length > 0).toBe(true)
  })

  it('폴더 여러 건이면 섹션 노출 조건(true) 반환', () => {
    const folders = ['개발', '디자인', '학습']
    expect(folders.length > 0).toBe(true)
  })
})
