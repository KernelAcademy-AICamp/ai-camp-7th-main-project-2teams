import { describe, it, expect, vi, beforeEach } from 'vitest'

// supabase 서버 클라이언트 모킹 — auth + bookmarks select 체인 (.eq().not())
const selectSpy = vi.fn()
const eqSpy = vi.fn()

let currentUser: unknown = { id: 'u1' }
let mockRows: Array<{ folder_hint: string[] | null }> = []
let mockDbError: string | null = null

function makeSupabase(user: unknown) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from() {
      return {
        select(cols: string) {
          selectSpy(cols)
          return {
            eq(col: string, val: unknown) {
              eqSpy(col, val)
              return {
                not() {
                  return Promise.resolve({
                    data: mockDbError ? null : mockRows,
                    error: mockDbError ? { message: mockDbError } : null,
                  })
                },
              }
            },
          }
        },
      }
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => makeSupabase(currentUser),
}))

import { GET, extractFolders, extractFolderPaths } from '../route'

function req() {
  return new Request('http://t/api/bookmarks/folders')
}

// ─────────────────────────────────────────────
// (1) extractFolders — 순수 함수 단위 테스트
// ─────────────────────────────────────────────
describe('extractFolders — folder_hint 전체 depth distinct 집계', () => {
  it('하위 폴더까지 모두 포함하고 정렬된 배열을 반환한다', () => {
    const rows = [
      { folder_hint: ['개발', '프론트엔드'] },
      { folder_hint: ['개발', '백엔드'] },
      { folder_hint: ['디자인'] },
    ]
    expect(extractFolders(rows)).toEqual(['개발', '디자인', '백엔드', '프론트엔드'])
  })

  it('null인 행은 무시한다', () => {
    const rows = [
      { folder_hint: null },
      { folder_hint: ['개발'] },
      { folder_hint: null },
    ]
    expect(extractFolders(rows)).toEqual(['개발'])
  })

  it('빈 배열인 행은 무시한다', () => {
    const rows = [
      { folder_hint: [] },
      { folder_hint: ['학습'] },
    ]
    expect(extractFolders(rows)).toEqual(['학습'])
  })

  it('빈 입력이면 빈 배열을 반환한다', () => {
    expect(extractFolders([])).toEqual([])
  })

  it('동일 폴더가 여러 번 나와도 한 번만 포함된다', () => {
    const rows = [
      { folder_hint: ['AI'] },
      { folder_hint: ['AI'] },
      { folder_hint: ['AI', '하위'] },
    ]
    expect(extractFolders(rows)).toEqual(['AI', '하위'])
  })

  it('빈 문자열은 제외한다 (folder="" 쿼리 방지)', () => {
    const rows = [
      { folder_hint: [''] },
      { folder_hint: ['', '하위'] },
      { folder_hint: ['개발'] },
    ]
    expect(extractFolders(rows)).toEqual(['개발', '하위'])
  })
})

describe('extractFolderPaths — 트리용 distinct 경로', () => {
  it('중복 경로를 한 번만, 빈 세그먼트 제거', () => {
    const rows = [
      { folder_hint: ['개발', '프론트엔드'] },
      { folder_hint: ['개발', '프론트엔드'] },
      { folder_hint: ['', '하위'] },
      { folder_hint: null },
      { folder_hint: [] },
    ]
    expect(extractFolderPaths(rows)).toEqual([['개발', '프론트엔드'], ['하위']])
  })
})

// ─────────────────────────────────────────────
// (2) GET /api/bookmarks/folders — Route Handler 통합
// ─────────────────────────────────────────────
describe('GET /api/bookmarks/folders', () => {
  beforeEach(() => {
    currentUser = { id: 'u1' }
    selectSpy.mockReset()
    eqSpy.mockReset()
    mockDbError = null
    mockRows = [
      { folder_hint: ['개발', '프론트엔드'] },
      { folder_hint: ['개발', '백엔드'] },
      { folder_hint: ['디자인'] },
    ]
  })

  it('미인증 → 401', async () => {
    currentUser = null
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('전체 depth distinct 집계 후 정렬된 목록 반환', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    const { folders } = await res.json()
    // 하위 폴더 포함 — distinct + sort
    expect(folders).toEqual(['개발', '디자인', '백엔드', '프론트엔드'])
  })

  it('select 컬럼에 embedding 미포함 (보안)', async () => {
    await GET(req())
    const calledWith: string = selectSpy.mock.calls[0][0]
    expect(calledWith).not.toContain('embedding')
    expect(calledWith).toContain('folder_hint')
  })

  it('폴더 없으면 빈 배열 반환', async () => {
    mockRows = []
    const res = await GET(req())
    expect(res.status).toBe(200)
    const { folders } = await res.json()
    expect(folders).toEqual([])
  })

  it('DB 오류 → 500', async () => {
    mockDbError = 'connection timeout'
    const res = await GET(req())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('connection timeout')
  })

  it('user_id 격리 — eq("user_id", user.id) 호출 확인 (RLS 외 명시적 격리)', async () => {
    await GET(req())
    expect(eqSpy).toHaveBeenCalledWith('user_id', 'u1')
  })
})
