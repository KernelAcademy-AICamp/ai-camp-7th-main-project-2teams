import { describe, it, expect, vi, beforeEach } from 'vitest'

// POST 저장 경로의 "동시성 계약" 회귀 테스트 (#307).
// 1) fetchMeta·태깅·임베딩이 실제로 겹쳐 실행되는가 (직렬화되면 응답 지연이 그만큼 늘어난다)
// 2) after() 후처리가 응답을 붙잡지 않는가 / 요청 컨텍스트 밖에서 동기 폴백하는가

// 수동 제어 가능한 promise — "아직 안 끝난 작업"을 만들기 위한 도구
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}
// 이벤트 루프 한 바퀴 — 병렬로 시작된 호출들이 발사될 틈을 준다
const tick = () => new Promise((r) => setTimeout(r, 0))

const { generateTags, createEmbedding } = vi.hoisted(() => ({
  generateTags: vi.fn(),
  createEmbedding: vi.fn(),
}))
vi.mock('@/lib/ai', () => ({
  generateTags,
  createEmbedding,
  buildWeakEmbeddingText: (t: string) => t,
  generateWeakSummary: async () => '',
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() },
}))

const { fetchMeta } = vi.hoisted(() => ({ fetchMeta: vi.fn() }))
vi.mock('@/lib/fetchMeta', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/fetchMeta')>()
  return { ...actual, fetchMeta }
})

// after() 스텁 — 실제 Next 요청 컨텍스트가 없는 테스트에서 동작을 직접 제어한다
const { afterSpy, afterState } = vi.hoisted(() => ({
  afterSpy: vi.fn(),
  afterState: { throws: false },
}))
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return {
    ...actual,
    after: (task: unknown) => {
      if (afterState.throws) throw new Error('after() outside request scope')
      afterSpy(task)
    },
  }
})

// supabase 모킹 — 중복 선검사와 events insert의 완료 시점을 테스트가 붙잡을 수 있게 gate 제공
const eventsInsertSpy = vi.fn()
let dupGate: Promise<void> | null = null
let eventsGate: Promise<void> | null = null
let eventsError: { message: string } | null = null

function makeSupabase(user: unknown) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from(table: string) {
      if (table === 'categories') {
        return {
          upsert: () => ({
            select: () => ({ single: async () => ({ data: { id: 'cat-개발' }, error: null }) }),
          }),
        }
      }
      if (table === 'events') {
        return {
          insert: async (rows: unknown) => {
            eventsInsertSpy(rows)
            if (eventsGate) await eventsGate
            return { error: eventsError }
          },
        }
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => {
                if (dupGate) await dupGate
                return { data: null, error: null }
              },
            }),
          }),
        }),
        insert: () => ({
          select: () => ({ single: async () => ({ data: { id: 'bm1' }, error: null }) }),
        }),
      }
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => makeSupabase({ id: 'u1' }),
}))

import { POST } from '../route'

function req(body: Record<string, unknown>) {
  return new Request('http://t/api/bookmarks', { method: 'POST', body: JSON.stringify(body) })
}

function resetMocks() {
  dupGate = null
  eventsGate = null
  eventsError = null
  afterState.throws = false
  afterSpy.mockReset()
  eventsInsertSpy.mockReset()
  generateTags.mockReset().mockResolvedValue(['개발'])
  createEmbedding.mockReset().mockResolvedValue([0.1])
  fetchMeta.mockReset().mockResolvedValue({
    title: '',
    description: '',
    thumbnailUrl: '',
    content: '',
  })
}

describe('POST /api/bookmarks · 병렬 실행', () => {
  beforeEach(resetMocks)

  it('fetchMeta는 중복 선검사 완료를 기다리지 않고 먼저 시작된다', async () => {
    const gate = deferred<void>()
    dupGate = gate.promise

    const res = POST(req({ title: 'T', url: 'https://a.com', content: '본문' }))
    await tick()

    // 중복 검사가 아직 대기 중인데도 외부 메타 조회는 이미 나가 있어야 한다
    expect(fetchMeta).toHaveBeenCalledTimes(1)

    gate.resolve()
    expect((await res).status).toBe(201)
  })

  it('임베딩은 태깅 완료를 기다리지 않고 병렬로 호출된다', async () => {
    const tags = deferred<string[]>()
    generateTags.mockReturnValue(tags.promise)

    const res = POST(req({ title: 'T', url: 'https://a.com', content: '본문' }))
    await tick()

    // 태깅이 아직 pending인데 임베딩이 이미 호출됨 = 병렬
    expect(createEmbedding).toHaveBeenCalledTimes(1)

    tags.resolve(['개발'])
    expect((await res).status).toBe(201)
  })

  it('content 없는 경로: 태그를 임베딩 입력에 넣어도 태깅은 1회만 호출', async () => {
    // weak-vector 경로는 tagsPromise를 두 번 소비한다 — 재호출되면 태깅 비용이 2배가 된다
    await POST(req({ title: 'T', url: 'https://a.com' }))
    expect(generateTags).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/bookmarks · after() 후처리', () => {
  beforeEach(resetMocks)

  it('계측 이벤트 flush를 기다리지 않고 응답한다', async () => {
    const gate = deferred<void>()
    eventsGate = gate.promise

    const res = await POST(req({ title: 'T', url: 'https://a.com', content: '본문' }))

    expect(res.status).toBe(201)
    expect(afterSpy).toHaveBeenCalledTimes(1) // 후처리는 after()에 위임
    expect(eventsInsertSpy).toHaveBeenCalledTimes(1) // 발사는 됐고 대기만 안 함
    gate.resolve()
  })

  it('bookmark_saved·tag_assigned 두 이벤트를 단일 insert로 적재', async () => {
    await POST(req({ title: 'T', url: 'https://a.com', content: '본문' }))
    const rows = eventsInsertSpy.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(rows.map((r) => r.type)).toEqual(['bookmark_saved', 'tag_assigned'])
    // 민감정보 금지 — meta에 본문·임베딩 미포함
    expect(JSON.stringify(rows)).not.toContain('본문')
    expect(JSON.stringify(rows)).not.toContain('embedding')
  })

  it('요청 컨텍스트 밖(after() throw)에서는 동기 대기로 폴백', async () => {
    afterState.throws = true
    const gate = deferred<void>()
    eventsGate = gate.promise

    const res = POST(req({ title: 'T', url: 'https://a.com', content: '본문' }))

    // flush가 끝나기 전에는 응답이 확정되지 않아야 한다
    const raced = await Promise.race([res.then(() => 'responded'), tick().then(() => 'pending')])
    expect(raced).toBe('pending')

    gate.resolve()
    expect((await res).status).toBe(201)
  })

  it('flush 실패해도 응답은 201 (계측이 UX를 막지 않음)', async () => {
    eventsError = { message: 'events table down' }
    const res = await POST(req({ title: 'T', url: 'https://a.com', content: '본문' }))
    expect(res.status).toBe(201)
  })
})
