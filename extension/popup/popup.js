const statusEl = document.getElementById('status')
const actionEl = document.getElementById('action')

function makeButton(text, id, className) {
  const btn = document.createElement('button')
  btn.id = id
  btn.textContent = text
  if (className) btn.className = className
  return btn
}

function renderAuth(session) {
  if (session?.user) {
    statusEl.textContent = session.user.email ?? '로그인됨'
    actionEl.replaceChildren(makeButton('로그아웃', 'logout', 'danger'))
    document.getElementById('logout').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'SIGN_OUT' }, () => renderUnauth())
    })
  } else {
    renderUnauth()
  }
}

function renderUnauth() {
  statusEl.textContent = '로그인이 필요합니다'
  actionEl.replaceChildren(makeButton('Google로 로그인', 'login', ''))
  document.getElementById('login').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_LOGIN_TAB' })
    window.close()
  })
}

// background로부터 SESSION_UPDATED 수신 (팝업 열려있는 경우)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SESSION_UPDATED') renderAuth(msg.session)
})

// 초기 세션 확인
chrome.runtime.sendMessage({ type: 'GET_SESSION' }, (session) => renderAuth(session))
