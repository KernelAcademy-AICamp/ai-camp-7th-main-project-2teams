# 북마크 임포트 중복 URL 필터링 설계

- 날짜: 2026-07-03
- 대상 파일: `front/app/api/bookmarks/import/route.ts` (+ 테스트)
- 범위: HTML 북마크 임포트(`POST /api/bookmarks/import`) 배치 처리 경로만. 단건 저장(`POST /api/bookmarks`)은 이미 `409` 사전 체크가 있어 범위 밖.

## 배경

임포트 라우트는 현재 `upsert(onConflict: 'user_id, url', ignoreDuplicates: false)`로 저장한다. 이미 DB에 있는 URL이 재업로드되면:

- insert 자체는 에러 없이 통과하지만 그 전에 `fetchMeta` → `generateTags` → `createEmbedding`이 **매번 호출**되어 OpenAI 비용/시간을 낭비한다.
- 기존 태그·카테고리가 조용히 덮어써진다.

같은 파일 안에 동일 URL이 여러 번 들어있는 경우(브라우저 북마크 내보내기에서 흔함)도 각각 별도로 AI 처리된다.

## 목표 동작

1. **DB 기존 중복**: 이미 저장된 URL이면 AI 호출 전부 스킵. 단, **폴더 경로(folder_hint)가 기존과 다르면 folder_hint만 UPDATE** — tags/category/embedding 등 다른 필드는 건드리지 않음. 경로가 같으면 완전 스킵(쓰기 없음).
2. **배치 내부 중복**: 업로드 파일 안에서 같은 URL이 여러 번 나오면 마지막 등장의 folder_hint를 최종값으로 채택(= "새 경로로 교체" 원칙을 배치 내부에도 동일 적용), 실제 insert는 한 번만. 나머지 등장은 duplicate 카운트.
3. 두 경우 모두 응답의 `duplicate` 카운트에 합산 — folder_hint가 실제로 갱신됐는지 여부는 별도 카운트하지 않음(응답 스키마 단순 유지).
4. 중복 여부 판단은 `normalizeUrl` 정규화 후 기준(기존 단건 저장 로직과 동일). folder_hint 비교는 배열 순서까지 포함한 완전 일치 비교(`JSON.stringify` 비교, `null`과 `[]`는 동일 취급).

## 데이터 흐름

```
allBookmarks (파싱 결과)
  → MAX_ITEMS 슬라이스 (초과분 skipped)
  → normalizeUrl 적용 + 배치 내부 dedup (Map<url, item>)
      → 같은 url 재등장 시 item을 최신 것으로 덮어씀(마지막 등장 folder_hint 채택) + duplicate++
      → 최종적으로 url당 후보 item 1개만 남음
  → 후보 url 목록을 청크(≈200개)로 나눠 DB 배치 조회
      (`select url, folder_hint from bookmarks where user_id = :uid and url in (...)`)
      → 존재하는 URL → folder_hint 매핑(existingMap) 확보
  → existingMap에 있는 후보:
      - folder_hint 동일(JSON 비교, null↔[] 동일 취급) → 완전 스킵, duplicate++
      - folder_hint 다름 → UPDATE로 folder_hint만 갱신(AI 호출 없음), duplicate++
  → existingMap에 없는 후보만 기존 CHUNK_SIZE 처리 루프(fetchMeta/AI/embedding/upsert)로 진행
```

DB 조회 자체가 실패하면(에러/예외) **fail-open** — 중복 체크를 생략하고 해당 항목들을 기존 경로로 그대로 흘려보낸다. 임포트 전체를 중단시키지 않는다. folder_hint UPDATE가 실패해도 마찬가지로 fail-open(해당 항목 duplicate로만 집계, failed 증가 없음).

## 변경 사항

### 1. 신규 헬퍼: 배치 내부 중복 제거 (last-wins)

`items`(파싱+슬라이스 완료 배열)를 순회하며 `normalizeUrl(rawUrl)`을 키로 하는 `Map<string, Item>`을 만든다. 같은 키가 다시 나오면 값을 덮어써(마지막 등장이 최종 folder_hint) `duplicate++`. 각 item에 정규화된 `url`을 미리 계산해 붙여서 이후 단계(DB 조회, AI 처리, insert/update)에서 재계산하지 않는다.

```ts
function dedupeBatch(
  items: ParsedBookmark[],
): { candidates: Map<string, ParsedBookmark & { url: string }>; duplicate: number } {
  const candidates = new Map<string, ParsedBookmark & { url: string }>()
  let duplicate = 0
  for (const item of items) {
    const url = normalizeUrl(item.url)
    if (candidates.has(url)) duplicate++
    candidates.set(url, { ...item, url }) // 마지막 등장으로 덮어씀 (folder_hint 포함)
  }
  return { candidates, duplicate }
}
```

### 2. 신규 로직: 기존 URL + folder_hint 배치 조회

```ts
async function fetchExistingByUrl(
  supabase: SupabaseClient,
  userId: string,
  urls: string[],
): Promise<Map<string, string[] | null>> {
  const CHUNK = 200
  const existing = new Map<string, string[] | null>()
  for (let i = 0; i < urls.length; i += CHUNK) {
    const slice = urls.slice(i, i + CHUNK)
    const { data, error } = await supabase
      .from('bookmarks')
      .select('url, folder_hint')
      .eq('user_id', userId)
      .in('url', slice)
    if (error) continue // fail-open — 이 청크만 중복 체크 생략, 전체 중단 안 함
    data?.forEach((row) => existing.set(row.url, row.folder_hint))
  }
  return existing
}

// null↔[] 동일 취급, 배열 순서까지 완전 일치해야 "같음"
function foldersEqual(a: string[] | null, b: string[] | null): boolean {
  const normA = a && a.length > 0 ? a : null
  const normB = b && b.length > 0 ? b : null
  return JSON.stringify(normA) === JSON.stringify(normB)
}
```

- 여러 청크 중 일부만 실패해도 성공한 청크는 정상적으로 중복 필터링에 반영된다(부분 fail-open).

### 3. 메인 루프 변경

- 배치 내부 dedup(`dedupeBatch`) → `fetchExistingByUrl` 호출 → 후보를 3그룹으로 분기:
  1. `existingMap`에 없음 → 기존 `CHUNK_SIZE` 처리 루프(fetchMeta/AI/embedding/upsert) 그대로 진행.
  2. `existingMap`에 있고 `foldersEqual`이 참 → 완전 스킵, `duplicate++`.
  3. `existingMap`에 있고 `foldersEqual`이 거짓 → `supabase.from('bookmarks').update({ folder_hint }).eq('user_id', userId).eq('url', url)` 실행(AI 호출 없음), 성공/실패 무관 `duplicate++`(fail-open, `failed` 증가 안 함).
- `dedupeBatch`에서 집계한 배치 내부 duplicate + 2/3그룹에서 집계한 duplicate를 합산해 최종 응답의 `duplicate` 필드로 반환.
- upsert 옵션 `ignoreDuplicates: false` → `true`로 변경. 사전 체크는 이미 대부분의 중복을 걸러내지만, 동시 요청 경합(같은 URL이 두 임포트 요청에 동시에 들어오는 경우 등) 시 마지막 방어선. `true`로 두면 경합 시 조용히 무시되어 기존 데이터를 덮어쓰지 않는다 — "완전 스킵" 원칙과 일치.

### 4. 응답 스키마

```ts
// 변경 전
{ imported, failed, skipped }
// 변경 후
{ imported, failed, skipped, duplicate }
```

기존 필드 의미는 유지(`skipped` = MAX_ITEMS 초과분). `duplicate`만 추가.

## 에러 처리

- DB 배치 조회 실패: fail-open, 해당 청크는 중복 체크 없이 처리(위 참고).
- folder_hint UPDATE 실패: fail-open, `duplicate`로만 집계(`failed` 증가 없음) — 폴더 갱신은 부가 기능이라 실패해도 임포트 자체를 실패로 취급하지 않음.
- 개별 항목(신규 insert 경로) 처리 중 예외: 기존과 동일하게 `failed++`, 배치 전체는 계속 진행.

## 테스트 계획

`front/app/api/bookmarks/import/__tests__/route.test.ts`에 추가:

1. DB에 이미 있는 URL 재업로드(폴더 경로 동일) → `duplicate: 1`, `fetchMeta`/`generateTags`/`createEmbedding` 호출 안 됨, upsert/update 둘 다 호출 안 됨.
2. DB에 이미 있는 URL인데 folder_hint가 다름 → `duplicate: 1`, AI 호출 안 됨, `update({ folder_hint: 새경로 })` 호출됨(tags/category/embedding 필드는 payload에 없음).
3. 같은 파일 안에 동일 URL이 서로 다른 폴더로 2번 등장 → 마지막 등장의 folder_hint로 upsert 호출(1회만), `duplicate: 1`.
4. 같은 파일 안에 동일 URL이 같은 폴더로 2번 등장 → upsert 1회만, `duplicate: 1`.
5. DB 존재 URL 조회용 supabase mock에서 `select().eq().in()` 에러 반환 → fail-open으로 정상 처리(AI 호출 발생, imported 카운트 정상).
6. folder_hint UPDATE 자체가 에러를 반환해도 응답 200 + `duplicate` 카운트 정상(= `failed` 증가 안 함).
7. 기존 테스트(`정상 임포트`, `folder_hint 보존`, `javascript: URL 스킵` 등)는 응답에 `duplicate: 0` 필드가 추가된 것 외 동작 변화 없음 — 기존 `toEqual({ imported, failed, skipped })` assertion은 `duplicate: 0` 추가해서 갱신.

## 범위 밖

- 단건 저장 라우트(`POST /api/bookmarks`)는 이미 사전 409 체크가 있어 변경 없음.
- Extension 쪽 저장 플로우는 이 API를 그대로 재사용하므로 별도 변경 불필요.
