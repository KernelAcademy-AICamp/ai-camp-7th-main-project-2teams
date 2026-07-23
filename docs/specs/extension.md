# Chrome Extension MV3 스펙

**관련 태스크**: A17~A25 (A22 토스트 태그 미리보기 포함)

---

## 디렉토리 구조

```
extension/
├── manifest.json
├── build.js               # esbuild — dist/background.js, dist/content.js 번들 (define으로 env 주입)
├── lib/
│   ├── config.js          # SUPABASE_URL/ANON_KEY/WEB_APP_URL — 빌드 타임 define, 로컬 fallback
│   ├── supabase.js        # chrome.storage.local 어댑터 + supabase 클라이언트 (싱글톤)
│   └── formatBookmarkPreview.js  # 카테고리/태그 미리보기 텍스트 — popup 토스트·백그라운드 알림 공용 (A22)
├── background/
│   └── index.js           # Service Worker (A18, A20, A21, A24) — dist/background.js로 빌드
├── content/
│   └── index.js           # 웹앱 세션 브릿지 전용 (postMessage → runtime.sendMessage) — dist/content.js로 빌드
├── popup/
│   ├── popup.html         # A19, A22
│   └── popup.js
└── __tests__/              # chrome mock + Vitest
```

> 페이지 본문/메타 수집은 content script가 아니라 background의 `chrome.scripting.executeScript`로 일원화(외부 페이지까지 커버). content script는 웹앱 페이지 전용 세션 브릿지.

---

## manifest.json (A17, A23)

```json
{
  "manifest_version": 3,
  "name": "Mowaba",
  "version": "0.1.0",
  "description": "AI 북마크 관리 — 자동 태깅 및 자연어 검색",
  "permissions": ["activeTab", "storage", "scripting", "notifications"],
  "host_permissions": [
    "http://localhost:3000/*",
    "https://*.vercel.app/*"
  ],
  "background": {
    "service_worker": "dist/background.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_title": "Mowaba"
  },
  "content_scripts": [
    {
      "matches": ["http://localhost:3000/*", "https://*.vercel.app/*"],
      "js": ["dist/content.js"],
      "run_at": "document_idle"
    }
  ],
  "commands": {
    "save-bookmark": {
      "suggested_key": { "default": "Ctrl+Shift+S", "mac": "Command+Shift+S" },
      "description": "현재 페이지 북마크 저장"
    }
  },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

> `host_permissions`/content_scripts `matches`는 웹앱 도메인(localhost·vercel.app)으로 최소화 — `<all_urls>`/`tabs`/`history`/`bookmarks` 미사용. 외부 페이지 본문 수집은 `activeTab`+`scripting`으로 커버(아래 §탭 정보 수집 참조). `notifications`는 단축키 저장 성공 시 태그 미리보기 알림 전용(아래 §단축키 저장 피드백).

---

## chrome.storage.local Supabase 어댑터 (A18)

```javascript
// lib/supabase.js
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js'

export const chromeStorage = {
  getItem: (key) =>
    new Promise((resolve) =>
      chrome.storage.local.get(key, (result) => resolve(result[key] ?? null))
    ),
  setItem: (key, value) =>
    new Promise((resolve) => chrome.storage.local.set({ [key]: value }, resolve)),
  removeItem: (key) =>
    new Promise((resolve) => chrome.storage.local.remove(key, resolve)),
}

// Background SW에서 세션 단일 관리 — autoRefreshToken으로 자동 갱신
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: chromeStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
```

`lib/config.js`의 `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`WEB_APP_URL`은 `build.js`(esbuild `define`)가 빌드 타임에 실제 값으로 치환. 환경변수 미설정 시 로컬 fallback(`localhost:3000` 등) 사용.

> Service Worker는 DOM 없음 → `localStorage` 불가 → `chrome.storage.local` 필수.

---

## 메시지 통신 (A18, A19, A20, A21)

```javascript
// background/index.js — 메시지 리스너
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_SESSION') {
    supabase.auth.getSession().then(({ data }) => sendResponse(data.session))
    return true
  }
  if (msg.type === 'SESSION_UPDATED') {
    handleSessionUpdated(msg.session).then(() => sendResponse({ ok: true }))
    return true
  }
  if (msg.type === 'GET_TAB_INFO') {
    // 현재 탭 title/content 반환 — popup 미리보기용
    return true
  }
  if (msg.type === 'SAVE_BOOKMARK') {
    saveCurrentTab().then(sendResponse)
    return true
  }
  if (msg.type === 'OPEN_LOGIN_TAB') {
    // 로그인 탭 오픈, tab id 기억(로그인 완료 후 자동 닫기용)
    return true
  }
  if (msg.type === 'SIGN_OUT') {
    signOutAndPurge().then(() => sendResponse({ ok: true }))
    return true
  }
  if (msg.type === 'PING') {
    sendResponse({ type: 'PONG' })
  }
  return true
})
```

메시지 타입: `GET_SESSION`, `SESSION_UPDATED`, `GET_TAB_INFO`, `SAVE_BOOKMARK`, `OPEN_LOGIN_TAB`, `SIGN_OUT`, `PING`. 문자열 리터럴로 직접 비교(별도 `MSG` 상수 객체 없음).

```javascript
// content/index.js — 웹앱 페이지 전용, 세션 브릿지만 담당
window.addEventListener('message', (event) => {
  if (event.source !== window) return
  if (event.data?.type === 'MOWABA_SESSION_UPDATED') {
    chrome.runtime.sendMessage({ type: 'SESSION_UPDATED', session: event.data.session })
  }
})
```

> content script는 `manifest.json`의 `matches`(웹앱 도메인)에만 주입되어 외부 페이지에는 없음 — 외부 페이지 본문 수집은 아래 §탭 정보 수집 참조.

---

## 탭 정보 수집 (A20)

content script 동적 주입(`GET_CONTENT` 메시지) 대신 **background에서 `chrome.scripting.executeScript`로 직접 수집**:

```javascript
// background/index.js
export async function extractPageInfo(tabId) {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const meta = (sel) => document.querySelector(sel)?.getAttribute('content')?.trim() ?? ''
        const description = meta('meta[property="og:description"]') || meta('meta[name="description"]')
        const title = document.title || meta('meta[property="og:title"]')
        const body = (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim()
        const content = [description, body].filter(Boolean).join('\n').slice(0, 2000)
        return { title, content }
      },
    })
    return injection?.result ?? null
  } catch {
    return null // chrome:// 등 주입 불가 페이지
  }
}
```

> 웹앱 전용 content script로는 외부 페이지(YouTube 등)를 커버할 수 없어 `executeScript` 직접 주입으로 대체 — `activeTab`+`scripting` 권한으로 모든 탭에서 동작.

---

## 북마크 저장 요청 (A21)

```javascript
// background/index.js
async function saveCurrentTab() {
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return { error: 'not authenticated' }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.url) return { error: 'no active tab' }

  const info = await extractPageInfo(tab.id)

  const res = await fetch(`${WEB_APP_URL}/api/bookmarks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData.session.access_token}` },
    body: JSON.stringify({
      url: tab.url ?? '',
      title: info?.title || tab.title || '',
      content: info?.content ?? '',
    }),
  })

  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    // 서버가 보낸 한국어 메시지·중복 플래그 그대로 전달 (A59)
    return { error: json.error || `HTTP ${res.status}`, duplicate: json.duplicate === true }
  }
  return res.json()
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'save-bookmark') return
  // 진행 중 배지 — 완료 시 결과 flashBadge가 덮어씀
  chrome.action.setBadgeText({ text: '…' })
  chrome.action.setBadgeBackgroundColor({ color: '#94a3b8' })
  const result = await saveCurrentTab().catch((e) => ({ error: String(e) }))
  if (result?.duplicate) {
    flashBadge('!', '#f1c40f')       // warning
  } else if (result?.error) {
    flashBadge('!', '#e74c3c')       // danger
  } else {
    flashBadge('✓', '#48c9b0')       // mint
    // 배지는 텍스트를 못 담아 태그 미리보기(A22)를 알림으로 표시 — 성공 시에만
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: '저장 완료',
      message: formatBookmarkPreview(result?.bookmark),
    })
  }
})
```

### 단축키 저장 피드백 (배지 + 알림)

팝업이 닫힌 상태의 단축키 저장은 토스트를 못 띄우므로 액션 배지로 상태 표시:

| 상태 | 배지 | 색 |
|------|------|-----|
| 진행 중 | `…` | slate (`#94a3b8`) |
| 성공 | `✓` | mint (`#48c9b0`) + `chrome.notifications` 태그 미리보기 |
| 중복 | `!` | warning (`#f1c40f`) |
| 실패 | `!` | danger (`#e74c3c`) |

```javascript
// background/index.js — 결과 배지 2초 후 자동 소거
function flashBadge(text, color) {
  chrome.action.setBadgeText({ text })
  chrome.action.setBadgeBackgroundColor({ color })
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000)
}
```

> 리스너는 async로 두고 `await`까지 마쳐야 크롬이 Service Worker를 살려둠 — 서버 AI 태깅 fetch가 수 초 걸리는 동안 프라미스를 리턴하지 않으면 SW 유휴 종료로 배지 콜백이 유실된다.

---

## 로그인 연동 흐름 (A19)

```javascript
// popup.js — 미인증 시
chrome.runtime.sendMessage({ type: 'OPEN_LOGIN_TAB' })
window.close()
```

```javascript
// background/index.js — 로그인 탭 오픈 + id 기억
if (msg.type === 'OPEN_LOGIN_TAB') {
  chrome.tabs.create({ url: `${WEB_APP_URL}/login?from=extension` })
    .then((tab) => { loginTabId = tab.id; sendResponse({ ok: true }) })
  return true
}

// 웹앱 로그인 완료 후 content script가 세션을 브릿지 → 로그인 탭 자동 닫기
async function handleSessionUpdated(session) {
  if (!session) return
  await supabase.auth.setSession(session)
  if (loginTabId != null) {
    chrome.tabs.remove(loginTabId).catch(() => {})
    loginTabId = null
  }
  chrome.runtime.sendMessage({ type: 'SESSION_UPDATED', session }).catch(() => {})
}
```

---

## 로컬 데이터 파기 (A24)

```javascript
// background/index.js — 로그아웃 또는 탈퇴 완료 수신 시
async function signOutAndPurge() {
  await supabase.auth.signOut().catch(() => {})
  await chrome.storage.local.clear()
}
```

---

## 팝업 UI 상태 (A19, A22)

팝업은 인증 상태에 따라 2가지 뷰를 렌더링한다.

| 상태 | 표시 요소 | 비고 |
|------|-----------|------|
| **비로그인** | "Google로 로그인" 버튼 | 클릭 → 웹앱 로그인 탭 오픈 |
| **로그인 후** | "현재 페이지 저장" 버튼 + 로그아웃 버튼 | 저장 진행/완료/실패/중복 4가지 토스트 |

### 저장 토스트 상세 (A22)

- **loading**: 스피너 + "저장 중..."
- **success**: "✓ 저장 완료" + `[카테고리] 태그1 · 태그2 · 태그3`(태그 없으면 "태그 없음"), 3초 후 자동 닫힘
- **error**: "오류: {message}", 3초 후 자동 닫힘
- **duplicate**: 서버 안내 메시지 그대로 노출(A59), 3초 후 자동 닫힘 — error와 톤 구분

```javascript
// lib/formatBookmarkPreview.js — popup 토스트·백그라운드 알림 공용 (A22)
export function formatBookmarkPreview(bookmark) {
  const category = bookmark?.category ? `[${bookmark.category}] ` : ''  // 카테고리 이름 (category_id 아님)
  const tags = bookmark?.tags?.length ? bookmark.tags.join(' · ') : '태그 없음'
  return `${category}${tags}`
}

// popup.js — 저장 완료 토스트: '✓ 저장 완료' + formatBookmarkPreview(state.bookmark)
// 렌더 후 3초 뒤 자동 닫힘(hidden 처리, 팝업 자체는 유지)
```

---

## 웹스토어 Privacy Practices 체크리스트 (A25)

| 항목 | 값 |
|---|---|
| 수집 데이터 | 현재 탭 URL, 제목, 본문 앞 2000자(og:description + innerText) |
| 본문 사용 목적 | AI 태깅·임베딩 후 즉시 파기 |
| 저장 데이터 | 인증 토큰 (chrome.storage.local) |
| 제3자 전달 | OpenAI (태깅·임베딩), Supabase (저장) |
| 본문 DB 저장 여부 | 없음 (처리 후 파기) |
| 토큰 제3자 전달 | 없음 |
