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
// 문장부호가 URL 뒤에 바로 붙는 경우("링크 (https://a.com/x)." 등) 제거 대상 문자.
const TRAILING_PUNCT_RE = /[.,!?;:'"”’)\]}]+$/

/**
 * 정규식이 함께 삼킨 문장부호를 제거한다. 같은 URL이 문장부호 유무로 다르게 잡히면
 * 이후 중복 제거(dedupeBatch/DB lookup)가 서로 다른 문자열로 착각해 중복이 새어나간다.
 * 단, "(disambiguation)"처럼 URL 자체에 포함된 괄호는 여는/닫는 개수를 비교해 보존한다.
 */
function stripTrailingPunctuation(url: string): string {
  let result = url
  while (TRAILING_PUNCT_RE.test(result)) {
    const last = result[result.length - 1]
    if (last === ')' && (result.match(/\(/g) ?? []).length >= (result.match(/\)/g) ?? []).length) {
      break
    }
    result = result.replace(TRAILING_PUNCT_RE, (match) => match.slice(0, -1))
  }
  return result
}

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
    for (const rawUrl of urls) {
      const url = stripTrailingPunctuation(rawUrl)
      if (!url) continue
      results.push({ title: url, url, folder_hint: [] })
    }
  }

  return results
}
