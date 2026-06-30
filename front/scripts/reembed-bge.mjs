// 머지·마이그레이션(0005) 후 1회 수동 실행. 기존 북마크 embedding(NULL) 재생성.
// content는 파기 정책상 없음 → title만 passage 임베딩. (신규 저장은 API가 title\ncontent 사용)
// 실행: front/ 에서  node scripts/reembed-bge.mjs   (.env 로드 후)
//   set -a && . ./.env && set +a && node scripts/reembed-bge.mjs
import { createClient } from '@supabase/supabase-js'

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BGE_API_KEY } = process.env
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase 환경변수 없음')
if (!BGE_API_KEY) throw new Error('BGE_API_KEY 없음')

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function embedBge(text) {
  const res = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${BGE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'baai/bge-m3', input: text, input_type: 'passage', truncate: 'END' }),
  })
  if (!res.ok) throw new Error(`bge-m3 ${res.status}`)
  return (await res.json()).data[0].embedding
}

const PAGE = 100
let done = 0

while (true) {
  // embedding NULL인 행만 — 멱등(재실행 안전). title만 사용(본문 없음).
  const { data, error } = await supabase
    .from('bookmarks')
    .select('id, title')
    .is('embedding', null)
    .limit(PAGE)
  if (error) throw error
  if (!data.length) break

  for (const b of data) {
    const embedding = await embedBge(b.title)
    const { error: upErr } = await supabase.from('bookmarks').update({ embedding }).eq('id', b.id)
    if (upErr) throw upErr
    done++
  }
  console.log(`재임베딩 ${done}건 완료...`)
}

console.log(`완료: 총 ${done}건 재임베딩`)
