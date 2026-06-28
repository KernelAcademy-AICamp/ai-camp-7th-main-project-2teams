import { supabase } from '../lib/supabase.js'

// { type, payload } 메시지 라우터
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_SESSION') {
    supabase.auth.getSession().then(({ data }) => sendResponse(data.session))
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
