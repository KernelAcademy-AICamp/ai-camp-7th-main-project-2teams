'use client'

import { useEffect, useState } from 'react'

type Admin = { userId: string; email: string; grantedAt: string }

export function AdminManager() {
  const [admins, setAdmins] = useState<Admin[] | null>(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const res = await fetch('/api/admin/admins')
      if (!res.ok) throw new Error()
      const body = await res.json()
      setAdmins(body.admins ?? [])
    } catch {
      setError('관리자 목록을 불러오지 못했습니다')
    }
  }

  useEffect(() => {
    let alive = true
    fetch('/api/admin/admins')
      .then(async (res) => {
        if (!alive) return
        if (!res.ok) throw new Error()
        const body = await res.json()
        if (alive) setAdmins(body.admins ?? [])
      })
      .catch(() => {
        if (alive) setError('관리자 목록을 불러오지 못했습니다')
      })
    return () => {
      alive = false
    }
  }, [])

  const grant = async () => {
    if (!email.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/admins', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (!res.ok) {
        setError(res.status === 422 ? '해당 이메일의 사용자를 찾을 수 없습니다' : '승격 실패')
        return
      }
      setEmail('')
      await load()
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (userId: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/admins?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' })
      if (!res.ok) {
        // 본인 강등은 서버에서 400으로 차단(잠금아웃 방지) — 여기서는 에러만 표시
        setError('강등 실패')
        return
      }
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border border-line bg-surface-card p-4">
      <h2 className="mb-3 text-sm font-medium text-text-secondary">관리자 관리</h2>

      <div className="mb-3 flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일로 승격"
          className="flex-1 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-text-primary"
        />
        <button
          type="button"
          onClick={grant}
          disabled={busy}
          className="rounded-md bg-brand px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          승격
        </button>
      </div>

      {error && <p className="mb-2 text-sm text-destructive">{error}</p>}

      {admins === null ? (
        <p className="text-sm text-text-secondary">불러오는 중…</p>
      ) : admins.length === 0 ? (
        <p className="text-sm text-text-secondary">관리자 없음</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {admins.map((a) => (
            <li key={a.userId} className="flex items-center justify-between gap-2 border-b border-line py-1 last:border-b-0">
              <span className="text-text-primary">{a.email}</span>
              <button
                type="button"
                onClick={() => revoke(a.userId)}
                disabled={busy}
                className="text-xs text-text-secondary hover:text-destructive disabled:opacity-50"
              >
                강등
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
