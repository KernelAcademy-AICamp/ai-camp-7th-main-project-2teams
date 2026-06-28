import { supabase } from '../lib/supabase.js'
import { WEB_APP_URL } from '../lib/config.js'

let loginTabId = null

// 웹앱 content script로부터 세션 수신 → 저장 + 팝업 알림
async function handleSessionUpdated(session) {
  if (!session) return
  await supabase.auth.setSession(session)
  // 로그인 탭 닫기
  if (loginTabId != null) {
    chrome.tabs.remove(loginTabId).catch(() => {})
    loginTabId = null
  }
  // 팝업이 열려있으면 알림
  chrome.runtime.sendMessage({ type: 'SESSION_UPDATED', session }).catch(() => {})
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_SESSION') {
    supabase.auth.getSession().then(({ data }) => sendResponse(data.session))
    return true
  }

  if (msg.type === 'SESSION_UPDATED') {
    handleSessionUpdated(msg.session).then(() => sendResponse({ ok: true }))
    return true
  }

  if (msg.type === 'OPEN_LOGIN_TAB') {
    chrome.tabs
      .create({ url: `${WEB_APP_URL}/login?from=extension` })
      .then((tab) => { loginTabId = tab.id; sendResponse({ ok: true }) })
    return true
  }

  if (msg.type === 'SIGN_OUT') {
    supabase.auth.signOut().then(() => sendResponse({ ok: true }))
    return true
  }

  if (msg.type === 'PING') {
    sendResponse({ type: 'PONG' })
  }
  return true
})
