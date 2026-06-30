// 서버사이드 전용 임베딩 — bge-m3 (NVIDIA 엔드포인트). BGE_API_KEY는 NEXT_PUBLIC_ 금지.
// bge-m3는 비대칭 retrieval 모델 — 저장 문서는 'passage', 검색 쿼리는 'query'로 임베딩.
const ENDPOINT = 'https://integrate.api.nvidia.com/v1/embeddings'
const MODEL = 'baai/bge-m3' // 1024차원

export type EmbedInputType = 'passage' | 'query'

export async function embedBge(text: string, inputType: EmbedInputType): Promise<number[]> {
  const apiKey = process.env.BGE_API_KEY
  if (!apiKey) throw new Error('BGE_API_KEY 미설정 — bge-m3 임베딩 불가')

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, input: text, input_type: inputType, truncate: 'END' }),
  })

  if (!res.ok) {
    // 본문(content) 평문 누출 방지 — 상태코드만 로깅
    throw new Error(`bge-m3 임베딩 실패: ${res.status}`)
  }

  const json = await res.json()
  return json.data[0].embedding
}
