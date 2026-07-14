import { formatBookmarkPreview } from '../lib/formatBookmarkPreview.js'

const statusEl = document.getElementById('status')
const statusTextEl = document.getElementById('status-text')
const actionEl = document.getElementById('action')
const toastEl = document.getElementById('toast')

let toastTimer = null

// 정적 아이콘 마크업 — 고정 문자열만 innerHTML로 삽입(사용자 입력 없음), 사용자 데이터는 항상 별도 textContent로 채움
const ICONS = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  alertCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
  alertTriangle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.29 3.86-8.18 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.89-3.14l-8.18-14a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></svg>',
  bookmarkPlus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16l7-4 7 4Z"/></svg>',
  logOut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  logIn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>',
}

function showToast(state) {
  clearTimeout(toastTimer)
  toastEl.hidden = false
  toastEl.className = state.type
  toastEl.replaceChildren()

  if (state.type === 'loading') {
    const spinner = document.createElement('span')
    spinner.className = 'spinner'
    const text = document.createTextNode('저장 중...')
    toastEl.append(spinner, text)
    return
  }

  if (state.type === 'success') {
    const icon = document.createElement('span')
    icon.innerHTML = ICONS.check

    const body = document.createElement('div')
    body.className = 'toast-body'

    const line1 = document.createElement('div')
    line1.textContent = '저장 완료'

    const line2 = document.createElement('div')
    line2.className = 'toast-tags'
    line2.textContent = formatBookmarkPreview(state.bookmark)

    body.append(line1, line2)
    toastEl.append(icon, body)
    toastTimer = setTimeout(() => { toastEl.hidden = true }, 3000)
    return
  }

  if (state.type === 'error') {
    const icon = document.createElement('span')
    icon.innerHTML = ICONS.alertCircle
    const text = document.createElement('div')
    text.className = 'toast-body'
    text.textContent = `오류: ${state.message}`
    toastEl.append(icon, text)
    toastTimer = setTimeout(() => { toastEl.hidden = true }, 3000)
    return
  }

  // 중복 북마크(A59) — 에러(빨강) 톤과 구분되는 안내 톤, 서버 메시지 그대로 노출
  if (state.type === 'duplicate') {
    const icon = document.createElement('span')
    icon.innerHTML = ICONS.alertTriangle
    const text = document.createElement('div')
    text.className = 'toast-body'
    text.textContent = state.message
    toastEl.append(icon, text)
    toastTimer = setTimeout(() => { toastEl.hidden = true }, 3000)
    return
  }
}

function makeButton(text, id, className, icon) {
  const btn = document.createElement('button')
  btn.id = id
  if (className) btn.className = className
  if (icon) {
    const iconEl = document.createElement('span')
    iconEl.innerHTML = ICONS[icon]
    btn.append(iconEl)
  }
  btn.append(document.createTextNode(text))
  return btn
}

function renderAuth(session) {
  if (session?.user) {
    statusEl.className = 'online'
    statusTextEl.textContent = session.user.email ?? '로그인됨'

    const saveBtn = makeButton('현재 페이지 저장', 'save', '', 'bookmarkPlus')
    const logoutBtn = makeButton('로그아웃', 'logout', 'danger', 'logOut')
    actionEl.replaceChildren(saveBtn, logoutBtn)
    toastEl.hidden = true

    document.getElementById('save').addEventListener('click', () => {
      saveBtn.disabled = true
      showToast({ type: 'loading' })
      chrome.runtime.sendMessage({ type: 'SAVE_BOOKMARK' }, (result) => {
        saveBtn.disabled = false
        if (result?.duplicate) {
          showToast({ type: 'duplicate', message: result.error })
        } else if (result?.error) {
          showToast({ type: 'error', message: result.error })
        } else {
          showToast({ type: 'success', bookmark: result?.bookmark })
        }
      })
    })

    document.getElementById('logout').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'SIGN_OUT' }, () => renderUnauth())
    })
  } else {
    renderUnauth()
  }
}

function renderUnauth() {
  toastEl.hidden = true
  statusEl.className = 'offline'
  statusTextEl.textContent = '로그인이 필요합니다'
  actionEl.replaceChildren(makeButton('Google로 로그인', 'login', '', 'logIn'))
  document.getElementById('login').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_LOGIN_TAB' })
    window.close()
  })
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SESSION_UPDATED') renderAuth(msg.session)
})

chrome.runtime.sendMessage({ type: 'GET_SESSION' }, (session) => renderAuth(session))
