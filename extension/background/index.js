// background service worker — 메시지 라우터
// A18: Auth 연동, A21: 저장 요청 처리 예정

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'PING') {
    sendResponse({ type: 'PONG' })
  }
  return true // async 응답 채널 유지
})
