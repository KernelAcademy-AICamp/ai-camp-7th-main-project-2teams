import { describe, it, expect, vi, beforeEach } from 'vitest'

let currentUser: unknown = { id: 'admin-1' }
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser }, error: null }) },
  }),
}))

import { isAdmin, withAdmin } from '../admin-auth'

function req() {
  return new Request('http://t/api/admin/stats')
}

describe('isAdmin', () => {
  beforeEach(() => {
    process.env.ADMIN_USER_IDS = 'admin-1, admin-2'
  })

  it('allowlist에 있으면 true', () => {
    expect(isAdmin('admin-1')).toBe(true)
    expect(isAdmin('admin-2')).toBe(true)
  })

  it('allowlist에 없으면 false', () => {
    expect(isAdmin('stranger')).toBe(false)
  })

  it('환경변수 미설정 시 아무도 admin 아님', () => {
    delete process.env.ADMIN_USER_IDS
    expect(isAdmin('admin-1')).toBe(false)
  })
})

describe('withAdmin', () => {
  beforeEach(() => {
    process.env.ADMIN_USER_IDS = 'admin-1'
    currentUser = { id: 'admin-1' }
  })

  it('관리자는 핸들러 통과', async () => {
    const handler = withAdmin(async () => Response.json({ ok: true }))
    const res = await handler(req())
    expect(res.status).toBe(200)
  })

  it('비관리자는 404 (존재 은닉)', async () => {
    currentUser = { id: 'stranger' }
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
