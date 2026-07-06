# A59 중복 북마크 경고 UI 설계

- 날짜: 2026-07-06
- 대상: `front/hooks/useAddBookmark.ts`, `front/components/AddBookmarkModal.tsx`, `extension/background/index.js`, `extension/popup/popup.js` (+ 각 테스트)
- tasks.json: A59 (`front/tasks.json`), 우선순위 high

## 배경

`POST /api/bookmarks`는 A35로 이미 `(user_id, url)` UNIQUE 위반 시 `409 { error: '이미 저장된 북마크입니다.', duplicate: true }`를 반환한다. 하지만 이 신호를 소비하는 쪽이 없다:

- 웹앱 `useAddBookmark.ts`는 `!res.ok`면 무조건 `json.error` 메시지로 일반 `Error`를 던진다 — `AddBookmarkModal.tsx`가 이를 다른 실패와 구분 없이 `text-destructive`(빨강) 스타일로 그대로 보여준다.
- 익스텐션 `background/index.js`는 더 나쁘다 — `if (!res.ok) return { error: \`HTTP ${res.status}\` }`로 응답 바디를 아예 파싱하지 않아 서버가 보낸 한국어 메시지 자체가 유실되고 `popup.js`엔 "HTTP 409"만 뜬다.

이번 스코프는 **단순 안내 문구만** — 기존 북마크로 이동하는 링크는 넣지 않는다(그러려면 409 응답에 기존 bookmark id를 추가해야 하는데, 스코프 밖으로 결정됨).

## 목표 동작

1. 웹앱에서 중복 URL 저장 시도 시 모달에 "이미 저장된 북마크입니다" 안내가 **에러가 아닌 정보** 톤(빨강 아님)으로 보인다.
2. 익스텐션에서 같은 경우 팝업 토스트에 서버 메시지 그대로("이미 저장된 북마크입니다") 안내색으로 뜬다. 지금처럼 "HTTP 409"만 보이는 상태를 없앤다.
3. 그 외 실패(네트워크 오류, 500 등)는 기존과 동일하게 에러(빨강) 톤 유지 — 중복만 구분한다.

## 컴포넌트

### `hooks/useAddBookmark.ts`

- `!res.ok` 분기에서 `json.duplicate === true`면 던지는 `Error`에 `duplicate` 플래그를 얹는다:
  ```ts
  const err = new Error(json.error || `저장 실패 (${res.status})`)
  if (json.duplicate) Object.assign(err, { duplicate: true })
  throw err
  ```
- 반환 타입 변경 없음 — `useMutation`의 `error` 객체를 그대로 쓰는 소비 측(`AddBookmarkModal`)에서 `duplicate` 유무만 체크.

### `components/AddBookmarkModal.tsx`

- 기존 에러 렌더 지점(`{error && <p className="text-xs text-destructive">...}`)을 분기:
  - `(error as Error & { duplicate?: boolean }).duplicate`가 true면 안내 톤 클래스(예: `text-amber-600 dark:text-amber-400`, 프로젝트 기존 info 컬러 관례 따름)로 같은 메시지 표시
  - 아니면 기존 `text-destructive` 그대로

### `extension/background/index.js`

- `saveCurrentTab` 응답 처리부(현재 76행 `if (!res.ok) return { error: \`HTTP ${res.status}\` }`)를 응답 바디 파싱으로 교체:
  ```js
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    return { error: json.error || `HTTP ${res.status}`, duplicate: json.duplicate === true }
  }
  ```

### `extension/popup/popup.js`

- `showToast`에 `duplicate` 타입 분기 추가(3번째 분기, `error`와 별도 스타일 클래스):
  ```js
  if (state.type === 'duplicate') {
    toastEl.textContent = state.message
    toastTimer = setTimeout(() => { toastEl.hidden = true }, 3000)
    return
  }
  ```
- `save` 클릭 핸들러의 `sendMessage` 콜백에서 `result?.duplicate`면 `showToast({ type: 'duplicate', message: result.error })`, 아니면 기존 `error`/`success` 분기 그대로.
- 팝업 CSS(`popup.html` 또는 별도 스타일시트)에 `.duplicate` 클래스 추가 — 기존 `.error`/`.success` 관례에 맞춰 안내색(파랑/앰버 계열) 지정.

## 에러 처리 / 한계

- 이번 스코프는 안내 문구 표시까지 — "기존 북마크로 이동" 링크, "무시하고 다시 저장" 같은 액션은 넣지 않는다(YAGNI, 필요해지면 409 응답에 bookmark id 추가하는 후속 작업).
- 네트워크 자체 실패(fetch reject) 등 `res`가 없는 경우는 기존 catch 경로 그대로 — `duplicate` 판단 대상이 아님.

## 테스트

- `useAddBookmark.test.ts`: 409 + `duplicate:true` 응답 시 던져진 Error에 `duplicate === true`가 실려 있는지 확인.
- `AddBookmarkModal.test.tsx`: `duplicate` 에러일 때 destructive 클래스가 아닌 안내 클래스가 적용되는지 확인.
- `saveBookmark.test.js`(익스텐션 기존 테스트 확장): 409 응답 mock 시 `{ error, duplicate: true }`가 그대로 반환되는지 확인.
- `toast.test.js`(익스텐션 기존 테스트 확장): `type: 'duplicate'` 호출 시 메시지가 표시되고 에러 클래스가 아닌지 확인.
