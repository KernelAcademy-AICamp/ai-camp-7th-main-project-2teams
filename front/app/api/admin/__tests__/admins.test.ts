import { describe, it, expect, vi, beforeEach } from 'vitest'

// 유효 uuid — self-demote(본인 강등 방지) 로직이 uuid 검증을 통과한 뒤 실제로
// 비교되도록 관리자 id를 유효 uuid 형식으로 고정 주입한다.
const ADMIN_ID = '00000000-0000-4000-8000-000000000001'

// withAdmin: ctx.user.id 고정 주입하는 pass-through mock
vi.mock('@/lib/admin-auth', () => ({
  withAdmin: (h: (req: Request, ctx: { user: { id: string } }) => unknown) =>
    (req: Request) => h(req, { user: { id: ADMIN_ID } }),
}))

const rpc = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }))

import { GET, POST, DELETE } from '../admins/route'

beforeEach(() => rpc.mockReset())

describe('GET /api/admin/admins', () => {
  it('관리자 목록 반환', async () => {
    rpc.mockResolvedValue({
      data: [{ user_id: 'u1', email: 'a@b.com', granted_at: '2026-07-01T00:00:00Z' }],
      error: null,
    })
    const res = await GET(new Request('http://x/api/admin/admins'))
    const body = await res.json()
    expect(body.admins).toEqual([{ userId: 'u1', email: 'a@b.com', grantedAt: '2026-07-01T00:00:00Z' }])
  })
})

describe('POST /api/admin/admins', () => {
  it('이메일 승격', async () => {
    rpc.mockResolvedValue({ data: [{ user_id: 'u2', email: 'new@b.com' }], error: null })
    const res = await POST(
      new Request('http://x/api/admin/admins', { method: 'POST', body: JSON.stringify({ email: 'new@b.com' }) }),
    )
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('admin_grant_by_email', { p_email: 'new@b.com', p_granted_by: ADMIN_ID })
  })

  it('잘못된 이메일 400', async () => {
    const res = await POST(
      new Request('http://x/api/admin/admins', { method: 'POST', body: JSON.stringify({ email: 'nope' }) }),
    )
    expect(res.status).toBe(400)
  })

  it('미존재 유저 422', async () => {
    // PostgREST는 plpgsql no_data_found를 SQLSTATE 'P0002'로 전달한다.
    // 조건 이름('no_data_found')이 code로 오지 않으므로 목도 실제 응답 형태를 따른다.
    rpc.mockResolvedValue({ data: null, error: { message: 'user not found', code: 'P0002' } })
    const res = await POST(
      new Request('http://x/api/admin/admins', { method: 'POST', body: JSON.stringify({ email: 'ghost@b.com' }) }),
    )
    expect(res.status).toBe(422)
  })

  // P0002 외의 RPC 오류가 '이메일 없음'으로 오진단되던 회귀를 막는다 (a13dbef)
  it('RPC 자체 오류는 422가 아니라 500', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'column reference "email" is ambiguous', code: '42702' },
    })
    const res = await POST(
      new Request('http://x/api/admin/admins', { method: 'POST', body: JSON.stringify({ email: 'new@b.com' }) }),
    )
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/admin/admins', () => {
  it('강등', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    const res = await DELETE(
      new Request('http://x/api/admin/admins?userId=550e8400-e29b-41d4-a716-446655440000', { method: 'DELETE' }),
    )
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('admin_revoke', { p_user_id: '550e8400-e29b-41d4-a716-446655440000' })
  })

  it('본인 강등 방지 400', async () => {
    const res = await DELETE(new Request(`http://x/api/admin/admins?userId=${ADMIN_ID}`, { method: 'DELETE' }))
    expect(res.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('userId 형식 오류 400', async () => {
    const res = await DELETE(new Request('http://x/api/admin/admins?userId=', { method: 'DELETE' }))
    expect(res.status).toBe(400)
  })
})
