import OpenAI from 'openai'

// 서버사이드 전용 — 클라이언트 번들 미포함 보장 (OPENAI_API_KEY는 NEXT_PUBLIC_ 금지).
// 지연 초기화: 모듈 로드 시점이 아닌 첫 호출 시 생성 → 키 없는 빌드 단계에서 throw 방지.
let client: OpenAI | null = null

export function getOpenAI(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return client
}
