import { describe, it, expect, vi, beforeEach } from 'vitest'

let currentUser: unknown = { id: 'admin-1' }
let rpcResult: { data: unknown; error: unknown } = { data: true, error: null }
const rpc = vi.fn(async () => rpcResult)

const fakeSupabase = {
  auth: { getUser: async () => ({ data: { user: currentUser }, error: null }) },
  rpc,
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => fakeSupabase,
}))

import { isAdmin, withAdmin } from '../admin-auth'

function req() {
  return new Request('http://t/api/admin/stats')
}

describe('isAdmin', () => {
  beforeEach(() => {
    rpc.mockClear()
    rpcResult = { data: true, error: null }
  })

  it('is_admin RPC가 true면 true', async () => {
    // @ts-expect-error 테스트 전용 fakeSupabase
    expect(await isAdmin(fakeSupabase)).toBe(true)
    // 인자 없이 호출 — auth.uid()로 호출자 본인만 조회, 타인 uuid 전달 불가
    expect(rpc).toHaveBeenCalledWith('is_admin')
  })

  it('is_admin RPC가 false면 false', async () => {
    rpcResult = { data: false, error: null }
    // @ts-expect-error 테스트 전용 fakeSupabase
    expect(await isAdmin(fakeSupabase)).toBe(false)
  })

  it('RPC 에러 시 fail-closed(false)', async () => {
    rpcResult = { data: null, error: { message: 'boom' } }
    // @ts-expect-error 테스트 전용 fakeSupabase
    expect(await isAdmin(fakeSupabase)).toBe(false)
  })
})

describe('withAdmin', () => {
  beforeEach(() => {
    currentUser = { id: 'admin-1' }
    rpcResult = { data: true, error: null }
  })

  it('관리자는 핸들러 통과', async () => {
    const handler = withAdmin(async () => Response.json({ ok: true }))
    const res = await handler(req())
    expect(res.status).toBe(200)
  })

  it('비관리자는 404 (존재 은닉)', async () => {
    currentUser = { id: 'stranger' }
    rpcResult = { data: false, error: null }
    const handler = withAdmin(async () => Response.json({ ok: true }))
    const res = await handler(req())
    expect(res.status).toBe(404)
  })

  it('미인증은 401 (withAuth 위임)', async () => {
    currentUser = null
    const handler = withAdmin(async () => Response.json({ ok: true }))
    const res = await handler(req())
    expect(res.status).toBe(401)
  })
})
