import { describe, it, expect, vi, beforeEach } from 'vitest'

// 유효 UUID — route가 id 형식(z.string().uuid())을 검증하므로 실제 형식 사용
const ID = '550e8400-e29b-41d4-a716-446655440000'

// --- mock 결과 제어 ---
let currentUser: unknown = { id: 'u1' }

let updateResult: { data: unknown; error: unknown } = {
  data: {
    id: ID,
    url: 'https://a.com',
    title: 'T',
    tags: [],
    category_id: null,
    folder_hint: null,
    is_favorite: true,
    created_at: '2024-01-01',
  },
  error: null,
}

let deleteResult: { error: unknown; count: number | null } = { error: null, count: 1 }

const updateSpy = vi.fn()
const selectArgSpy = vi.fn()
const deleteSpy = vi.fn()
const eqSpy = vi.fn() // .eq(col, val) 인자 기록 — user_id 격리 검증용

// update 체인: .eq().eq().select().single()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeUpdateChain(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    eq(col: string, val: unknown) {
      eqSpy(col, val)
      return chain
    },
    select(cols: string) {
      selectArgSpy(cols)
      return { single: async () => updateResult }
    },
  }
  return chain
}

// delete 체인: .eq().eq() 후 await → deleteResult (thenable)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDeleteChain(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    eq(col: string, val: unknown) {
      eqSpy(col, val)
      return chain
    },
    then(
      resolve: (v: typeof deleteResult) => unknown,
      reject?: (e: unknown) => unknown,
    ) {
      return Promise.resolve(deleteResult).then(resolve, reject)
    },
  }
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser }, error: null }) },
    from() {
      return {
        update(payload: Record<string, unknown>) {
          updateSpy(payload)
          return makeUpdateChain()
        },
        delete(opts?: unknown) {
          deleteSpy(opts)
          return makeDeleteChain()
        },
      }
    },
  }),
}))

import { PATCH, DELETE } from '../route'

// Next.js 16: params는 Promise
const params = Promise.resolve({ id: ID })

function patchReq(body: unknown) {
  return new Request(`http://t/api/bookmarks/${ID}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

function deleteReq() {
  return new Request(`http://t/api/bookmarks/${ID}`, { method: 'DELETE' })
}

describe('PATCH /api/bookmarks/:id', () => {
  beforeEach(() => {
    currentUser = { id: 'u1' }
    updateSpy.mockReset()
    selectArgSpy.mockReset()
    eqSpy.mockReset()
    updateResult = {
      data: {
        id: ID,
        url: 'https://a.com',
        title: 'T',
        tags: [],
        category_id: null,
        folder_hint: null,
        is_favorite: true,
        created_at: '2024-01-01',
      },
      error: null,
    }
  })

  it('정상 토글 → 200 + { bookmark }', async () => {
    const res = await PATCH(patchReq({ is_favorite: true }), { params })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.bookmark.id).toBe(ID)
    expect(json.bookmark.is_favorite).toBe(true)
  })

  it('update payload에 요청한 is_favorite 값 전달 (false 토글)', async () => {
    await PATCH(patchReq({ is_favorite: false }), { params })
    expect(updateSpy.mock.calls[0][0]).toEqual({ is_favorite: false })
  })

  it('user_id로 사용자 격리 (eq 호출)', async () => {
    await PATCH(patchReq({ is_favorite: true }), { params })
    expect(eqSpy).toHaveBeenCalledWith('user_id', 'u1')
    expect(eqSpy).toHaveBeenCalledWith('id', ID)
  })

  it('select 컬럼에 embedding 미포함 (누출 방지)', async () => {
    await PATCH(patchReq({ is_favorite: false }), { params })
    const selectedCols: string = selectArgSpy.mock.calls[0][0]
    expect(selectedCols).not.toContain('embedding')
  })

  it('잘못된 body (is_favorite 타입 오류) → 400, update 미호출', async () => {
    const res = await PATCH(patchReq({ is_favorite: 'yes' }), { params })
    expect(res.status).toBe(400)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('잘못된 id 형식 → 400, update 미호출', async () => {
    const res = await PATCH(patchReq({ is_favorite: true }), {
      params: Promise.resolve({ id: 'not-a-uuid' }),
    })
    expect(res.status).toBe(400)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('존재하지 않거나 타인 북마크 (PGRST116) → 404', async () => {
    updateResult = {
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    }
    const res = await PATCH(patchReq({ is_favorite: true }), { params })
    expect(res.status).toBe(404)
  })

  it('DB 에러 → 500', async () => {
    updateResult = { data: null, error: { code: 'XX000', message: 'db error' } }
    const res = await PATCH(patchReq({ is_favorite: true }), { params })
    expect(res.status).toBe(500)
  })

  it('미인증 → 401', async () => {
    currentUser = null
    const res = await PATCH(patchReq({ is_favorite: true }), { params })
    expect(res.status).toBe(401)
  })
})

describe('DELETE /api/bookmarks/:id', () => {
  beforeEach(() => {
    currentUser = { id: 'u1' }
    deleteSpy.mockReset()
    eqSpy.mockReset()
    deleteResult = { error: null, count: 1 }
  })

  it('정상 삭제 → 200 + { success: true }', async () => {
    const res = await DELETE(deleteReq(), { params })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })

  it('user_id로 사용자 격리 (eq 호출)', async () => {
    await DELETE(deleteReq(), { params })
    expect(eqSpy).toHaveBeenCalledWith('user_id', 'u1')
  })

  it('0행 삭제 (미존재·타인) → 404', async () => {
    deleteResult = { error: null, count: 0 }
    const res = await DELETE(deleteReq(), { params })
    expect(res.status).toBe(404)
  })

  it('DB 에러 → 500', async () => {
    deleteResult = { error: { message: 'db error' }, count: null }
    const res = await DELETE(deleteReq(), { params })
    expect(res.status).toBe(500)
  })

  it('잘못된 id 형식 → 400, delete 미호출', async () => {
    const res = await DELETE(deleteReq(), {
      params: Promise.resolve({ id: 'bad' }),
    })
    expect(res.status).toBe(400)
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it('미인증 → 401', async () => {
    currentUser = null
    const res = await DELETE(deleteReq(), { params })
    expect(res.status).toBe(401)
  })
})
