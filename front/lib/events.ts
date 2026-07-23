import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from './logger'

// North Star Input Metrics 계측 이벤트 4종. meta에 embedding·content 등 민감정보 금지.
export const EVENT_TYPES = [
  'bookmark_saved',
  'tag_assigned',
  'search_performed',
  'search_result_clicked',
] as const
export type EventType = (typeof EVENT_TYPES)[number]

// 클라이언트가 직접 로깅해도 되는 타입(위조돼도 무해한 상호작용). 나머지는 서버 전용 —
// 저장/검색 성공 시점에만 서버가 기록해 지표 위조를 차단한다.
export const CLIENT_LOGGABLE: readonly EventType[] = ['search_result_clicked']

type EventInput = { type: EventType; meta?: Record<string, unknown> }

// 분석 이벤트는 절대 UX를 막지 않는다 — 실패해도 삼키고 요청은 정상 진행.
// 여러 이벤트를 배열로 받아 단일 insert(1 라운드트립)로 적재.
export async function logEvents(
  supabase: SupabaseClient,
  userId: string,
  events: EventInput[],
): Promise<void> {
  if (events.length === 0) return
  const rows = events.map((e) => ({ user_id: userId, type: e.type, meta: e.meta ?? {} }))
  const { error } = await supabase.from('events').insert(rows)
  if (error) logger.warn('[events] insert 실패', { error: error.message })
}

export function logEvent(
  supabase: SupabaseClient,
  userId: string,
  type: EventType,
  meta?: Record<string, unknown>,
): Promise<void> {
  return logEvents(supabase, userId, [{ type, meta }])
}
