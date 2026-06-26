# Chrome Extension MV3 스펙

**관련 태스크**: A17~A25 (A22 토스트 태그 미리보기 포함)

---

## 디렉토리 구조

```
extension/
├── manifest.json
├── background/
│   └── index.js          # Service Worker (A18, A21, A24)
├── popup/
│   ├── index.html        # A19, A22
│   ├── index.js
│   └── style.css
├── content/
│   └── index.js          # 탭 본문 수집 (A20)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## manifest.json (A17, A23)

```json
{
  "manifest_version": 3,
  "name": "북마크 AI",
  "version": "1.0.0",
  "description": "AI 자동 태깅 북마크 관리",

  "permissions": [
    "activeTab",
    "storage",
    "scripting"
  ],

  "host_permissions": [
    "https://your-app.vercel.app/*"
  ],

  "background": {
    "service_worker": "background/index.js",
    "type": "module"
  },

  "action": {
    "default_popup": "popup/index.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },

  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/index.js"],
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

> **제거 대상**: `tabs`(전체 탭 목록), `history`, `bookmarks` — `activeTab`으로 대체.

---

## chrome.storage.local Supabase 어댑터 (A18)

```javascript
// background/index.js
import { createClient } from '@supabase/supabase-js'

const chromeStorageAdapter = {
  getItem: (key) =>
    new Promise((resolve) =>
      chrome.storage.local.get([key], (result) => resolve(result[key] ?? null))
    ),
  setItem: (key, value) =>
    new Promise((resolve) =>
      chrome.storage.local.set({ [key]: value }, resolve)
    ),
  removeItem: (key) =>
    new Promise((resolve) =>
      chrome.storage.local.remove([key], resolve)
    ),
}

const supabase = createClient(
  'https://xxxx.supabase.co',
  'ANON_KEY',
  {
    auth: {
      storage: chromeStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
)
```

> Service Worker는 DOM 없음 → `localStorage` 불가 → `chrome.storage.local` 필수.

---

## Popup ↔ Background 메시지 통신 (A18, A19)

```javascript
// 메시지 타입 정의
const MSG = {
  GET_SESSION: 'GET_SESSION',
  SIGN_OUT: 'SIGN_OUT',
  SESSION_UPDATED: 'SESSION_UPDATED',
  SAVE_BOOKMARK: 'SAVE_BOOKMARK',
}

// background/index.js — 메시지 리스너
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === MSG.GET_SESSION) {
    supabase.auth.getSession().then(({ data }) => sendResponse(data.session))
    return true // 비동기 응답 필수
  }
  if (msg.type === MSG.SIGN_OUT) {
    supabase.auth.signOut()
      .then(() => chrome.storage.local.clear())
      .then(() => sendResponse({ ok: true }))
    return true
  }
  if (msg.type === MSG.SAVE_BOOKMARK) {
    handleSaveBookmark(msg.payload).then(sendResponse)
    return true
  }
})

// 단축키 리스너 (A21)
chrome.commands.onCommand.addListener((command) => {
  if (command === 'save-bookmark') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      triggerSave(tab)
    })
  }
})
```

```javascript
// popup/index.js — 세션 조회
const session = await chrome.runtime.sendMessage({ type: MSG.GET_SESSION })
```

---

## 탭 본문 수집 (A20)

```javascript
// content/index.js — 페이지에서 실행
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_CONTENT') {
    sendResponse({
      content: document.body?.innerText?.slice(0, 2000) ?? '',
    })
  }
})
```

```javascript
// background/index.js — content script 호출
async function getTabContent(tabId) {
  // MV3: chrome.scripting.executeScript (tabs.executeScript 대체)
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content/index.js'],
  })
  return chrome.tabs.sendMessage(tabId, { type: 'GET_CONTENT' })
}
```

---

## 북마크 저장 요청 (A21)

```javascript
// background/index.js
const API_URL = 'https://your-app.vercel.app' // 환경변수로 관리

async function handleSaveBookmark({ title, url, content }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'not_authenticated' }

  const res = await fetch(`${API_URL}/api/bookmarks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ title, url, content }),
  })

  return res.json()
}
```

---

## 로그인 연동 흐름 (A19)

```javascript
// popup/index.js — 미인증 시
function openLoginTab() {
  chrome.tabs.create({
    url: `${API_URL}/login?from=extension`,
  })
}

// 웹앱(A4)에서 로그인 완료 후
// window.close()와 함께:
chrome.runtime.sendMessage({
  type: MSG.SESSION_UPDATED,
  session: supabaseSession,
})
```

---

## 로컬 데이터 파기 (A24)

```javascript
// 로그아웃 또는 탈퇴 완료 수신 시
async function clearLocalData() {
  await supabase.auth.signOut()
  await chrome.storage.local.clear()
}
```

---

## 팝업 UI 상태 (A19, A22)

팝업은 인증 상태에 따라 3가지 뷰를 렌더링한다.

| 상태 | 표시 요소 | 비고 |
|------|-----------|------|
| **비로그인** | Google OAuth 버튼 (대) | 클릭 → 웹앱 로그인 탭 오픈 |
| **로그인 후 (대기)** | 저장 버튼 (대) + 단축키 안내 (`Cmd+Shift+S`) | 현재 탭 정보 미리 표시 |
| **저장 완료** | 토스트 메시지 + 태그 미리보기 | 3초 후 자동 닫힘 |

### 저장 완료 토스트 상세 (A22)

```
┌──────────────────────────┐
│ ✓ 저장됨                  │
│ #React #훅 #프론트엔드     │  ← AI가 생성한 태그 미리보기
└──────────────────────────┘
```

- 노출 시간: 3초 이내 자동 닫힘
- 태그 표시: AI 응답 tags 배열 최대 3개 (`#태그명` 형식)
- API 응답 전까지는 로딩 스피너 표시

```javascript
// popup/index.js — 저장 완료 토스트 예시
async function showSaveToast(tags) {
  const tagText = tags.slice(0, 3).map(t => `#${t}`).join(' ')
  document.getElementById('toast').innerHTML = `
    <span>✓ 저장됨</span>
    <span class="tags">${tagText}</span>
  `
  document.getElementById('toast').classList.add('visible')
  setTimeout(() => window.close(), 3000)
}
```

---

## 웹스토어 Privacy Practices 체크리스트 (A25)

| 항목 | 값 |
|---|---|
| 수집 데이터 | 현재 탭 URL, 제목, 본문 앞 2000자 |
| 본문 사용 목적 | AI 태깅·임베딩 후 즉시 파기 |
| 저장 데이터 | 인증 토큰 (chrome.storage.local) |
| 제3자 전달 | OpenAI (태깅·임베딩), Supabase (저장) |
| 본문 DB 저장 여부 | 없음 (처리 후 파기) |
| 토큰 제3자 전달 | 없음 |
