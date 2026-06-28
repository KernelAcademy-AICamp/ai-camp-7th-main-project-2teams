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

// background → content: 페이지 본문 앞 2000자 반환 (AI 태깅용, DB 저장 금지)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_CONTENT') {
    sendResponse({ content: document.body.innerText.slice(0, 2000) })
  }
})
