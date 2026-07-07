// 서버사이드 전용 SSRF 방어 유틸 — 사용자 제공 URL을 서버가 대신 fetch하는 모든 경로(메타 크롤링,
// 썸네일 프록시)에서 공용으로 사용. 사설망/루프백 호스트로의 요청을 차단.

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h === '0.0.0.0' || h === '::1') return true
  if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  // IPv6 link-local(fe80::/10) · unique-local(fc00::/7)
  if (/^fe[89ab][0-9a-f]:/i.test(h) || /^f[cd][0-9a-f]{2}:/i.test(h)) return true
  return false
}

// http/https 프로토콜 + 사설망 아님 확인. 원본 URL을 서버가 직접 fetch하기 전 항상 통과해야 함.
export function isSafeHttpUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    return !isBlockedHost(u.hostname)
  } catch {
    return false
  }
}
