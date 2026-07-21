import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logger } from '@/lib/logger'

// 유효 UUID — route가 id 형식(z.string().uuid())을 검증하므로 실제 형식 사용
const ID = '550e8400-e29b-41d4-a716-446655440000'

// --- mock 결과 제어 ---
let currentUser: unknown = { id: 'u1' }

function baseBookmarkRow() {
  return {
    id: ID,
    url: 'https://a.com',
    title: 'T',
    description: null,
    tags: [],
    category_id: null,
    folder_hint: null,
    is_favorite: true,
    created_at: '2024-01-01',
  }
}

// bookmarks 메인 update(.select().single()) 결과
let updateResult: { data: unknown; error: unknown } = { data: baseBookmarkRow(), error: null }
// bookmarks 두 번째 update(embedding, select 없이 await) 결과
let embeddingUpdateResult: { error: unknown } = { error: null }
// categories upsert(.select().single()) 결과
let categoryUpsertResult: { data: unknown; error: unknown } = {
  data: { id: 'cat-1' },
  error: null,
}
let deleteResult: { error: unknown; count: number | null } = { error: null, count: 1 }

const bookmarksUpdateSpy = vi.fn()
const categoriesUpsertSpy = vi.fn()
const selectArgSpy = vi.fn()
const deleteSpy = vi.fn()
const eqSpy = vi.fn() // .eq(col, val) 인자 기록 — user_id 격리 검증용
const eventInsertSpy = vi.fn() // events.insert 인자 기록 — 수동 재태깅 계측 검증용

vi.mock('@/lib/ai', () => ({
  createEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
}))

// bookmarks.update 체인: 메인 업데이트는 .eq().eq().select().single(),
// embedding 전용 업데이트는 select 없이 .eq().eq() 후 바로 await(thenable).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeBookmarksUpdateChain(payload: Record<string, unknown>): any {
  const isEmbeddingUpdate = 'embedding' in payload
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
    then(
      resolve: (v: typeof embeddingUpdateResult) => unknown,
      reject?: (e: unknown) => unknown,
    ) {
      if (!isEmbeddingUpdate) {
        // 메인 업데이트는 반드시 select().single()을 거쳐야 함 — 실수로 바로 await하면 실패시켜 조기 발견
        return Promise.reject(new Error('메인 update는 select().single()을 호출해야 함')).then(
          resolve,
          reject,
        )
      }
      return Promise.resolve(embeddingUpdateResult).then(resolve, reject)
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
    from(table: string) {
      if (table === 'categories') {
        return {
          upsert(payload: Record<string, unknown>, opts?: unknown) {
            categoriesUpsertSpy(payload, opts)
            return {
              select(cols: string) {
                selectArgSpy(cols)
                return { single: async () => categoryUpsertResult }
              },
            }
          },
        }
      }
      if (table === 'events') {
        return {
          insert(rows: unknown) {
            eventInsertSpy(rows)
            return Promise.resolve({ error: null })
          },
        }
      }
      return {
        update(payload: Record<string, unknown>) {
          bookmarksUpdateSpy(payload)
          return makeBookmarksUpdateChain(payload)
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
import { createEmbedding } from '@/lib/ai'

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
    bookmarksUpdateSpy.mockReset()
    categoriesUpsertSpy.mockReset()
    selectArgSpy.mockReset()
    eqSpy.mockReset()
    eventInsertSpy.mockReset()
    vi.mocked(createEmbedding).mockClear()
    updateResult = { data: baseBookmarkRow(), error: null }
    embeddingUpdateResult = { error: null }
    categoryUpsertResult = { data: { id: 'cat-1' }, error: null }
  })

  it('정상 토글 → 200 + { bookmark } (is_favorite 단독 — 기존 동작 유지)', async () => {
    const res = await PATCH(patchReq({ is_favorite: true }), { params })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.bookmark.id).toBe(ID)
    expect(json.bookmark.is_favorite).toBe(true)
  })

  it('update payload에 요청한 is_favorite 값만 전달 (false 토글)', async () => {
    await PATCH(patchReq({ is_favorite: false }), { params })
    expect(bookmarksUpdateSpy.mock.calls[0][0]).toEqual({ is_favorite: false })
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
    expect(bookmarksUpdateSpy).not.toHaveBeenCalled()
  })

  it('빈 body({}) → 400, update 미호출', async () => {
    const res = await PATCH(patchReq({}), { params })
    expect(res.status).toBe(400)
    expect(bookmarksUpdateSpy).not.toHaveBeenCalled()
  })

  it('잘못된 id 형식 → 400, update 미호출', async () => {
    const res = await PATCH(patchReq({ is_favorite: true }), {
      params: Promise.resolve({ id: 'not-a-uuid' }),
    })
    expect(res.status).toBe(400)
    expect(bookmarksUpdateSpy).not.toHaveBeenCalled()
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

  it('태그만 변경 → update payload에 tags만 반영, 재임베딩 미호출', async () => {
    updateResult = { data: { ...baseBookmarkRow(), tags: ['프론트엔드'] }, error: null }
    const res = await PATCH(patchReq({ tags: ['프론트엔드'] }), { params })
    expect(res.status).toBe(200)
    expect(bookmarksUpdateSpy.mock.calls[0][0]).toEqual({ tags: ['프론트엔드'] })
    expect(categoriesUpsertSpy).not.toHaveBeenCalled()
    expect(createEmbedding).not.toHaveBeenCalled()
  })

  it('태그 변경 → tag_assigned{source:manual} 계측 1건 적재', async () => {
    updateResult = { data: { ...baseBookmarkRow(), tags: ['프론트엔드'] }, error: null }
    await PATCH(patchReq({ tags: ['프론트엔드'] }), { params })
    expect(eventInsertSpy).toHaveBeenCalledTimes(1)
    const rows = eventInsertSpy.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(rows[0]).toMatchObject({
      user_id: 'u1',
      type: 'tag_assigned',
      meta: { source: 'manual', tags_changed: true, tag_count: 1 },
    })
  })

  it('is_favorite 단독 수정 → 계측 미적재 (태깅 무관)', async () => {
    await PATCH(patchReq({ is_favorite: true }), { params })
    expect(eventInsertSpy).not.toHaveBeenCalled()
  })

  it('description 단독 수정 → 계측 미적재', async () => {
    updateResult = { data: { ...baseBookmarkRow(), description: 'd' }, error: null }
    await PATCH(patchReq({ description: 'd' }), { params })
    expect(eventInsertSpy).not.toHaveBeenCalled()
  })

  it('카테고리만 변경(유효한 대분류) → categories upsert 후 category_id 반영', async () => {
    const res = await PATCH(patchReq({ category: '개발' }), { params })
    expect(res.status).toBe(200)
    expect(categoriesUpsertSpy).toHaveBeenCalledWith(
      { name: '개발', user_id: 'u1' },
      { onConflict: 'user_id,name' },
    )
    expect(bookmarksUpdateSpy.mock.calls[0][0]).toEqual({ category_id: 'cat-1' })
    expect(createEmbedding).not.toHaveBeenCalled()
  })

  it('카테고리 alias 입력(dev)도 표준 대분류(개발)로 해석', async () => {
    await PATCH(patchReq({ category: 'dev' }), { params })
    expect(categoriesUpsertSpy).toHaveBeenCalledWith(
      { name: '개발', user_id: 'u1' },
      { onConflict: 'user_id,name' },
    )
  })

  it('카테고리를 null(미분류)로 변경 → upsert 없이 category_id: null 반영 (회귀 방지)', async () => {
    updateResult = { data: { ...baseBookmarkRow(), category_id: null }, error: null }
    const res = await PATCH(patchReq({ category: null }), { params })
    expect(res.status).toBe(200)
    expect(categoriesUpsertSpy).not.toHaveBeenCalled()
    expect(bookmarksUpdateSpy.mock.calls[0][0]).toEqual({ category_id: null })
  })

  it('유효하지 않은 카테고리 → 400, upsert/update 미호출', async () => {
    const res = await PATCH(patchReq({ category: '존재하지않는카테고리' }), { params })
    expect(res.status).toBe(400)
    expect(categoriesUpsertSpy).not.toHaveBeenCalled()
    expect(bookmarksUpdateSpy).not.toHaveBeenCalled()
  })

  it('categories.upsert 실패 → 500, bookmarks update 미호출', async () => {
    categoryUpsertResult = { data: null, error: { message: 'upsert failed' } }
    const res = await PATCH(patchReq({ category: '개발' }), { params })
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('upsert failed')
    expect(bookmarksUpdateSpy).not.toHaveBeenCalled()
  })

  it('description만 변경 → title+description으로 재임베딩 호출, embedding 컬럼 갱신', async () => {
    updateResult = {
      data: { ...baseBookmarkRow(), title: 'T', description: '새 설명' },
      error: null,
    }
    const res = await PATCH(patchReq({ description: '새 설명' }), { params })
    expect(res.status).toBe(200)
    expect(bookmarksUpdateSpy.mock.calls[0][0]).toEqual({ description: '새 설명' })
    expect(createEmbedding).toHaveBeenCalledWith('T\n새 설명')
    // 두 번째 update 호출 — embedding 컬럼만 갱신
    expect(bookmarksUpdateSpy.mock.calls[1][0]).toEqual({ embedding: [0.1, 0.2, 0.3] })
  })

  it('description을 null로 변경해도 파싱 성공 (설명 삭제)', async () => {
    updateResult = { data: { ...baseBookmarkRow(), description: null }, error: null }
    const res = await PATCH(patchReq({ description: null }), { params })
    expect(res.status).toBe(200)
    expect(bookmarksUpdateSpy.mock.calls[0][0]).toEqual({ description: null })
    // description 없으면(null) title만으로 임베딩
    expect(createEmbedding).toHaveBeenCalledWith('T')
  })

  it('여러 필드 동시 변경(tags+category+description) → 모두 반영', async () => {
    updateResult = {
      data: { ...baseBookmarkRow(), tags: ['백엔드'], category_id: 'cat-1', description: 'd' },
      error: null,
    }
    const res = await PATCH(
      patchReq({ tags: ['백엔드'], category: '개발', description: 'd' }),
      { params },
    )
    expect(res.status).toBe(200)
    expect(bookmarksUpdateSpy.mock.calls[0][0]).toEqual({
      tags: ['백엔드'],
      description: 'd',
      category_id: 'cat-1',
    })
    expect(createEmbedding).toHaveBeenCalledWith('T\nd')
  })

  it('재임베딩 실패해도 필드 변경 응답은 200 유지 (best-effort degrade)', async () => {
    vi.mocked(createEmbedding).mockRejectedValueOnce(new Error('openai down'))
    updateResult = { data: { ...baseBookmarkRow(), description: '새 설명' }, error: null }
    const res = await PATCH(patchReq({ description: '새 설명' }), { params })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.bookmark.description).toBe('새 설명')
  })

  it('재임베딩 update 자체가 에러 반환해도 200 유지, logger.error 호출 (best-effort degrade)', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
    embeddingUpdateResult = { error: { message: 'embedding update failed' } }
    updateResult = { data: { ...baseBookmarkRow(), description: '새 설명' }, error: null }

    const res = await PATCH(patchReq({ description: '새 설명' }), { params })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.bookmark.description).toBe('새 설명')
    expect(errorSpy).toHaveBeenCalledWith('[re-embed-fail]', {
      id: ID,
      message: 'embedding update failed',
    })
    errorSpy.mockRestore()
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
