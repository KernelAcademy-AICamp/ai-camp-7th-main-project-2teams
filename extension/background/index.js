import { supabase } from '../lib/supabase.js'
import { WEB_APP_URL } from '../lib/config.js'

let loginTabId = null

// 웹앱 content script로부터 세션 수신 → 저장 + 팝업 알림
async function handleSessionUpdated(session) {
  if (!session) return
  await supabase.auth.setSession(session)
  if (loginTabId != null) {
    chrome.tabs.remove(loginTabId).catch(() => {})
    loginTabId = null
  }
  chrome.runtime.sendMessage({ type: 'SESSION_UPDATED', session }).catch(() => {})
}

// 로그아웃·탈퇴 시 로컬 세션·캐시 완전 파기 (A24, 개보법 21조)
// signOut으로 세션 정리 후 storage.local.clear()로 잔여 키까지 제거(이중 방어).
async function signOutAndPurge() {
  await supabase.auth.signOut().catch(() => {})
  await chrome.storage.local.clear()
}

// 활성 탭의 라이브 DOM에서 title/description/content 추출 (activeTab + scripting 권한).
// content script는 웹앱에만 주입되므로 외부 페이지(YouTube 등)는 executeScript로 직접 수집.
// SPA·동의 페이지 때문에 서버 fetchMeta가 빈약한 경우를 보완 — title·메타 설명 확보로 AI 태깅 품질 향상.
export async function extractPageInfo(tabId) {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const meta = (sel) =>
          document.querySelector(sel)?.getAttribute('content')?.trim() ?? ''
        const description =
          meta('meta[property="og:description"]') || meta('meta[name="description"]')
        const title = document.title || meta('meta[property="og:title"]')
        const body = (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim()
        // description(있으면) + 본문을 합쳐 AI 입력 신호 강화, 2000자 상한
        const content = [description, body].filter(Boolean).join('\n').slice(0, 2000)
        return { title, content }
      },
    })
    return injection?.result ?? null
  } catch {
    // chrome:// 등 주입 불가 페이지 → null (title은 호출부에서 tab.title 폴백)
    return null
  }
}

// 현재 탭 정보(url/title/content) + 세션 토큰으로 POST /api/bookmarks
async function saveCurrentTab() {
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return { error: 'not authenticated' }

  // activeTab 권한으로 커버: 팝업/단축키(사용자 액션) 시에만 url/title 접근 가능
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return { error: 'no active tab' }
  if (!tab.url) return { error: 'tab url unavailable' }

  const info = await extractPageInfo(tab.id)

  const res = await fetch(`${WEB_APP_URL}/api/bookmarks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionData.session.access_token}`,
    },
    body: JSON.stringify({
      url: tab.url ?? '',
      // 라이브 DOM title 우선, 실패 시 탭 메타데이터 폴백
      title: info?.title || tab.title || '',
      content: info?.content ?? '',
    }),
  })

  if (!res.ok) return { error: `HTTP ${res.status}` }
  return res.json()
}

// 단축키 (Cmd+Shift+S / Ctrl+Shift+S) → 저장
chrome.commands.onCommand.addListener((command) => {
  if (command === 'save-bookmark') saveCurrentTab()
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_SESSION') {
    supabase.auth.getSession().then(({ data }) => sendResponse(data.session))
    return true
  }

  if (msg.type === 'SESSION_UPDATED') {
    handleSessionUpdated(msg.session).then(() => sendResponse({ ok: true }))
    return true
  }

  if (msg.type === 'GET_TAB_INFO') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      if (!tab?.id) return sendResponse({ error: 'no active tab' })
      const info = await extractPageInfo(tab.id)
      sendResponse({
        url: tab.url ?? '',
        title: info?.title || tab.title || '',
        content: info?.content ?? '',
      })
    })
    return true
  }

  if (msg.type === 'SAVE_BOOKMARK') {
    saveCurrentTab().then(sendResponse)
    return true
  }

  if (msg.type === 'OPEN_LOGIN_TAB') {
    chrome.tabs
      .create({ url: `${WEB_APP_URL}/login?from=extension` })
      .then((tab) => { loginTabId = tab.id; sendResponse({ ok: true }) })
    return true
  }

  if (msg.type === 'SIGN_OUT') {
    signOutAndPurge().then(() => sendResponse({ ok: true }))
    return true
  }

  if (msg.type === 'PING') {
    sendResponse({ type: 'PONG' })
  }
  return true
})
