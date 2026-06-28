// 웹앱 ↔ background 메시지 브릿지
// window.postMessage(BOOKMARKER_SESSION_UPDATED) → chrome.runtime.sendMessage(SESSION_UPDATED)

window.addEventListener('message', (event) => {
  if (event.source !== window) return
  if (event.data?.type === 'BOOKMARKER_SESSION_UPDATED') {
    chrome.runtime.sendMessage({
      type: 'SESSION_UPDATED',
      session: event.data.session,
    })
  }
})
