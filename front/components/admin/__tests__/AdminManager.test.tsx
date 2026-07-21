// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { AdminManager } from '../AdminManager'

const admins = [{ userId: 'u1', email: 'a@b.com', grantedAt: '2026-07-01T00:00:00Z' }]

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return { ok: true, json: async () => ({ admin: { userId: 'u2', email: 'new@b.com' } }) }
    if (init?.method === 'DELETE') return { ok: true, json: async () => ({ ok: true }) }
    return { ok: true, json: async () => ({ admins }) }
  }))
})

describe('AdminManager', () => {
  it('관리자 목록 렌더', async () => {
    render(<AdminManager />)
    expect(await screen.findByText('a@b.com')).toBeInTheDocument()
  })

  it('이메일 입력 후 승격 호출', async () => {
    render(<AdminManager />)
    await screen.findByText('a@b.com')
    fireEvent.change(screen.getByPlaceholderText('이메일로 승격'), { target: { value: 'new@b.com' } })
    fireEvent.click(screen.getByRole('button', { name: '승격' }))
    await waitFor(() => {
      expect(fetch as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
        '/api/admin/admins',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })
})
