import type { ParsedBookmark } from '@/lib/parseNetscapeBookmarks'

/**
 * RFC4180 스타일 CSV 파서 — 카톡 내보내기 Message 컬럼은 따옴표 안에 줄바꿈·쉼표를
 * 그대로 포함하므로(멀티라인 필드), 단순 split('\n')로는 깨진다. 상태 기반으로 직접 파싱.
 */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

const URL_RE = /https?:\/\/[^\s"]+/g

/**
 * 카카오톡 채팅 내보내기 CSV(Date,User,Message)를 파싱해 Message 컬럼에 포함된
 * URL만 북마크 후보로 추출한다. URL이 아닌 대화 본문은 저장·보관하지 않는다(privacy 원칙).
 */
export function parseKakaoChat(csv: string): ParsedBookmark[] {
  const rows = parseCsvRows(csv)
  if (rows.length === 0) return []

  const header = rows[0].map((h) => h.trim().toLowerCase())
  const messageIdx = header.indexOf('message')
  if (messageIdx === -1) return []

  const results: ParsedBookmark[] = []
  for (const row of rows.slice(1)) {
    const message = row[messageIdx]
    if (!message) continue
    const urls = message.match(URL_RE)
    if (!urls) continue
    for (const url of urls) {
      results.push({ title: url, url, folder_hint: [] })
    }
  }

  return results
}
