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

// 현재 탭 정보(url/title/content) + 세션 토큰으로 POST /api/bookmarks
async function saveCurrentTab() {
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return { error: 'not authenticated' }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return { error: 'no active tab' }

  const contentRes = await new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, { type: 'GET_CONTENT' }, (res) => resolve(res))
  })

  const res = await fetch(`${WEB_APP_URL}/api/bookmarks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionData.session.access_token}`,
    },
    body: JSON.stringify({
      url: tab.url ?? '',
      title: tab.title ?? '',
      content: contentRes?.content ?? '',
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
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (!tab?.id) return sendResponse({ error: 'no active tab' })
      chrome.tabs.sendMessage(tab.id, { type: 'GET_CONTENT' }, (res) => {
        sendResponse({
          url: tab.url ?? '',
          title: tab.title ?? '',
          content: res?.content ?? '',
        })
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
    supabase.auth.signOut().then(() => sendResponse({ ok: true }))
    return true
  }

  if (msg.type === 'PING') {
    sendResponse({ type: 'PONG' })
  }
  return true
})
