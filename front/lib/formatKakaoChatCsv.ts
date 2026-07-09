export interface ChatCsvBookmark {
  title: string
  url: string
  created_at: string
}

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

// ISO 8601('2023-09-15T03:39:04.000Z') → 카톡 내보내기 Date 컬럼 표기('2023-09-15 03:39:04')
function formatDate(iso: string): string {
  return iso.replace('T', ' ').slice(0, 19)
}

/**
 * 카카오톡 채팅 내보내기 CSV(Date,User,Message)와 동일한 포맷으로 북마크를 직렬화한다.
 * Message 컬럼에 url을 그대로 심어 parseKakaoChat으로 재임포트 가능하게 한다(왕복 호환).
 * BOM(﻿)·LF 개행도 실제 카톡 내보내기 파일과 동일하게 맞춘다.
 */
export function formatKakaoChatCsv(bookmarks: ChatCsvBookmark[]): string {
  const header = 'Date,User,Message'
  const rows = bookmarks.map(
    (b) => `${formatDate(b.created_at)},${csvField(b.title)},${csvField(b.url)}`,
  )
  return `﻿${[header, ...rows].join('\n')}\n`
}
