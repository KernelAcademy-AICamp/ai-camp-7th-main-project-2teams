// content script — 현재 페이지 본문 수집 (A20에서 구현)
// background의 chrome.scripting.executeScript()로 주입됨

function getPageContent() {
  return {
    title: document.title,
    url: location.href,
    content: document.body?.innerText?.slice(0, 2000) ?? '',
  }
}

// background로부터 수집 요청 수신
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_CONTENT') {
    sendResponse(getPageContent())
  }
  return true
})
