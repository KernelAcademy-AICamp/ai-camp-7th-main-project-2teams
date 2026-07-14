const statusEl = document.getElementById('status')
const actionEl = document.getElementById('action')
const toastEl = document.getElementById('toast')

let toastTimer = null

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
    const line1 = document.createElement('div')
    line1.textContent = '✓ 저장 완료'

    const line2 = document.createElement('div')
    line2.className = 'toast-tags'
    // category_id(UUID)가 아니라 API 응답의 category(대분류 이름)를 표시 — A22 태그 미리보기 토스트.
    const category = state.bookmark?.category ? `[${state.bookmark.category}] ` : ''
    const tags = state.bookmark?.tags?.length ? state.bookmark.tags.join(' · ') : '태그 없음'
    line2.textContent = `${category}${tags}`

    toastEl.append(line1, line2)
    toastTimer = setTimeout(() => { toastEl.hidden = true }, 3000)
    return
  }

  if (state.type === 'error') {
    toastEl.textContent = `오류: ${state.message}`
    toastTimer = setTimeout(() => { toastEl.hidden = true }, 3000)
    return
  }

  // 중복 북마크(A59) — 에러(빨강) 톤과 구분되는 안내 톤, 서버 메시지 그대로 노출
  if (state.type === 'duplicate') {
    toastEl.textContent = state.message
    toastTimer = setTimeout(() => { toastEl.hidden = true }, 3000)
    return
  }
}

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

    const saveBtn = makeButton('현재 페이지 저장', 'save', '')
    const logoutBtn = makeButton('로그아웃', 'logout', 'danger')
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
  statusEl.textContent = '로그인이 필요합니다'
  actionEl.replaceChildren(makeButton('Google로 로그인', 'login', ''))
  document.getElementById('login').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_LOGIN_TAB' })
    window.close()
  })
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SESSION_UPDATED') renderAuth(msg.session)
})

chrome.runtime.sendMessage({ type: 'GET_SESSION' }, (session) => renderAuth(session))
