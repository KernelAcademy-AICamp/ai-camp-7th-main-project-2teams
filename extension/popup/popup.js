// popup UI 진입점 — A19 로그인 UI, A22 토스트 예정

const statusEl = document.getElementById('status')

chrome.runtime.sendMessage({ type: 'PING' }, (res) => {
  if (chrome.runtime.lastError || !res) {
    statusEl.textContent = '연결 오류'
    return
  }
  statusEl.textContent = '준비됨'
})
