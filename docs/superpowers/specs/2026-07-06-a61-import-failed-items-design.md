# A61 임포트 실패 항목 상세 리스트 설계

- 날짜: 2026-07-06
- 대상: `front/app/api/bookmarks/import/route.ts`, `front/hooks/useImportBookmarks.ts`, `front/app/(dashboard)/import/page.tsx` (+ 각 테스트)
- tasks.json: A61 (`front/tasks.json`), 우선순위 medium
- 참고: `docs/superpowers/specs/2026-07-06-import-progress-sse-design.md`(SSE 진행률), `docs/superpowers/specs/2026-07-03-import-duplicate-url-filter-design.md`(중복 필터) — 둘 다 이미 구현 완료. 이 문서는 그 위에 남은 갭만 다룬다.

## 배경

PRD가 요구한 "파일 임포트 고도화"(속도표시/결과요약/로그/부분완료목록/에러상세/문제보고) 중 진행률 표시와 완료 후 요약(성공/중복/실패 카운트)은 이미 SSE 스트리밍으로 구현돼 있다(`route.ts`의 `ReadableStream` + `progress`/`done` 이벤트, `import/page.tsx`의 진행바·요약 카운트). 남은 갭은 **실패 항목이 구체적으로 어떤 URL이고 왜 실패했는지**를 사용자가 알 방법이 없다는 것 — 지금은 `failed` 카운트 숫자만 보이고 개별 항목 정보는 버려진다.

`route.ts`의 실패 지점은 세 곳이다(항목 단위 `try/catch` 안):

1. 임베딩 생성 실패(`embeddingResult.status === 'rejected'`, 222행) — `failed++`만 하고 return.
2. DB upsert 에러(265행) — `failed++`만.
3. 그 외 예외(270행 바깥 catch, fetchMeta/태깅/카테고리 조회 중 잡히지 않은 예외) — `failed++`만.

세 곳 다 어떤 URL이 실패했는지, 왜 실패했는지 어디에도 남기지 않는다.

"문제 보고"(사용자가 실패 건을 신고/재시도 요청하는 UI)는 이번 스코프에서 제외한다(확정됨) — 실패 목록을 눈으로 보는 것까지만.

## 목표 동작

1. 임포트 완료 후, 실패 건이 있으면 요약 카운트 아래 "실패 항목 보기 (N)" 형태로 펼쳐볼 수 있는 리스트가 나타난다.
2. 리스트의 각 행은 실패한 URL과 사유(3종 고정 문구 중 하나)를 보여준다.
3. DB 에러 원문(`error.message`)은 클라이언트에 노출하지 않는다 — 스키마·내부 구조 유출 방지, 고정된 사용자 친화 문구로 매핑한다.

## 컴포넌트

### `app/api/bookmarks/import/route.ts`

- 스트림 클로저 상단에 `const failedItems: { url: string; reason: string }[] = []` 선언(기존 `imported`/`duplicate`/`failed` 카운터 옆).
- 세 실패 지점 각각에 push 추가:
  ```ts
  // 222행 임베딩 실패
  if (embeddingResult.status === 'rejected') {
    failed++
    failedItems.push({ url, reason: '임베딩 생성 실패' })
    return
  }
  ```
  ```ts
  // 265행 upsert 에러 — error.message는 로그에만, 클라이언트엔 고정 문구
  if (error) {
    failed++
    failedItems.push({ url, reason: '저장 실패' })
  } else {
    imported++
  }
  ```
  ```ts
  // 270행 바깥 catch
  } catch {
    failed++
    failedItems.push({ url, reason: '처리 중 오류' })
  }
  ```
- `done` 이벤트에 `failedItems` 추가: `send(controller, { type: 'done', imported, failed, skipped, duplicate, failedItems })`.
- `progress` 이벤트에는 넣지 않는다 — 리스트는 완료 후 한 번만 필요, 매 진행률 이벤트마다 누적 배열을 반복 전송하면 스트림 페이로드만 커진다.

### `hooks/useImportBookmarks.ts`

- `ImportResult` 인터페이스에 `failedItems: { url: string; reason: string }[]` 필드 추가.
- SSE 파싱 로직은 이미 `done` 이벤트 JSON을 그대로 resolve하므로 타입 추가 외 로직 변경 없음.

### `app/(dashboard)/import/page.tsx`

- 완료 후 요약 블록(기존 duplicate/failed 카운트 표시 부분, 231/245행 근처) 아래에 `mutation.data.failedItems.length > 0`일 때만 접이식 섹션 추가.
- 접힌 기본 상태, "실패 항목 보기 (N)" 버튼 클릭 시 펼침 — `<details>`/`<summary>` 네이티브 엘리먼트로 충분(별도 상태 관리 불필요, ponytail).
- 각 행: URL(길면 truncate, title 속성으로 전체 노출) + 사유 텍스트.

## 에러 처리 / 한계

- "문제 보고"(재시도 트리거, 신고 제출) 기능 없음 — 목록 표시까지만.
- 사유는 3종 고정 문구로 뭉뚱그린다 — 항목별 상세 스택트레이스나 원인 세분화는 하지 않는다(운영 로그에서 확인 가능, 사용자 대상 UI는 단순하게 유지).
- 실패 URL 목록은 이번 응답에서만 보여주고 별도로 저장/재조회하지 않는다 — 페이지 새로고침하면 사라짐(YAGNI, 필요해지면 후속으로 임포트 이력 저장 고려).

## 테스트

- `route.test.ts`: 임베딩 실패/upsert 에러/예외 각 케이스에서 `done` 이벤트의 `failedItems`에 올바른 `{ url, reason }`이 들어가는지 확인. 성공 항목은 `failedItems`에 포함되지 않는지 확인.
- `useImportBookmarks.test.ts`: SSE 파싱 결과에 `failedItems`가 그대로 전달되는지 확인.
- `import/page.test.tsx`: `failedItems`가 빈 배열이면 접이식 섹션 자체가 안 보이는지, 항목 있으면 펼쳤을 때 URL+사유가 렌더되는지 확인.
