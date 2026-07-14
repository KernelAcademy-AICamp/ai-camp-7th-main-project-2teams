import { z } from 'zod'

// Zod v4: z.url() 독립 메서드 사용 가능 (체이닝도 동일하게 동작)
// content는 DB insert 금지(보안 규칙) — bookmarkSchema에 미포함.
// 본문은 A5에서 OpenAI 처리 전용 transient 스키마로 분리 정의.
export const bookmarkSchema = z.object({
  title: z.string().min(1).max(500),
  url: z.url(),
})

// A5 전용 transient — content는 OpenAI 처리 후 파기, DB 저장·로그 금지(보안 규칙).
// bookmarkSchema(공개)와 분리: content를 영속 스키마에 포함하지 않기 위함.
export const bookmarkCreateSchema = bookmarkSchema.extend({
  content: z.string().max(2000).optional().default(''),
  folder_hint: z.array(z.string()).optional(),
})

export const searchSchema = z.object({
  // trim 선행 — 공백 전용 쿼리(" ")가 min(1)을 통과해 createEmbedding('')로 미제어 500이 나는 것 방지.
  query: z.string().trim().min(1).max(50),
  category: z.string().min(1).optional(),
  // A58: 태그·즐겨찾기 필터 — 둘 다 optional, 미지정 시 기존 전체 검색 동작 유지.
  tag: z.string().min(1).optional(),
  is_favorite: z.boolean().optional(),
})

// A60: PATCH /api/bookmarks/:id 확장 — 즐겨찾기·태그·카테고리·설명 부분 수정.
// 모든 필드 optional(부분 수정) + refine으로 빈 body(필드 0개) 400 처리.
// is_favorite 단독 요청도 그대로 통과 — 기존 즐겨찾기 토글 하위 호환.
export const bookmarkUpdateSchema = z
  .object({
    is_favorite: z.boolean().optional(),
    // AI 경로 불변식(대분류 제외 중+소분류 최대 2개, lib/ai.ts 태그 수 규칙)과 동일하게 제한.
    tags: z.array(z.string().min(1).max(50)).max(2).optional(),
    // 대분류 이름(또는 alias) — 실제 유효성 검증은 tag-alias.ts 기준으로 라우트에서 수행.
    // null 허용 — 미분류로 변경(카테고리 해제) 용도.
    category: z.string().min(1).max(50).nullable().optional(),
    // null 허용 — 기존 설명 삭제 용도.
    description: z.string().max(2000).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: '변경할 필드를 최소 1개 이상 전달해야 합니다.',
  })

export type BookmarkInput = z.infer<typeof bookmarkSchema>
export type BookmarkCreateInput = z.infer<typeof bookmarkCreateSchema>
export type SearchInput = z.infer<typeof searchSchema>
export type BookmarkUpdateInput = z.infer<typeof bookmarkUpdateSchema>
