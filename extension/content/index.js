// 웹앱 ↔ background 메시지 브릿지 (웹앱 페이지에만 주입)
// window.postMessage(BOOKMARKER_SESSION_UPDATED) → chrome.runtime.sendMessage(SESSION_UPDATED)
// 페이지 본문/메타 수집은 background의 chrome.scripting.executeScript로 일원화 — 외부 페이지도 커버.

window.addEventListener('message', (event) => {
  if (event.source !== window) return
  if (event.data?.type === 'BOOKMARKER_SESSION_UPDATED') {
    chrome.runtime.sendMessage({
      type: 'SESSION_UPDATED',
      session: event.data.session,
    })
  }
})
