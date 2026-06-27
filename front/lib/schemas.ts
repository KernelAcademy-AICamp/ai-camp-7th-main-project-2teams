import { z } from 'zod'

// Zod v4: z.url() 독립 메서드 사용 가능 (체이닝도 동일하게 동작)
// content는 DB insert 금지(보안 규칙) — bookmarkSchema에 미포함.
// 본문은 A5에서 OpenAI 처리 전용 transient 스키마로 분리 정의.
export const bookmarkSchema = z.object({
  title: z.string().min(1).max(500),
  url: z.url(),
})

export const searchSchema = z.object({
  query: z.string().min(1).max(50),
})

export const favoriteSchema = z.object({
  is_favorite: z.boolean(),
})

export type BookmarkInput = z.infer<typeof bookmarkSchema>
export type SearchInput = z.infer<typeof searchSchema>
export type FavoriteInput = z.infer<typeof favoriteSchema>
