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

1. **DB 기존 중복**: 이미 저장된 URL이면 AI 호출·DB 쓰기 전부 스킵. 기존 데이터는 그대로 유지.
2. **배치 내부 중복**: 업로드 파일 안에서 같은 URL이 여러 번 나오면 처음 것만 처리, 나머지는 스킵.
3. 두 경우 모두 응답의 `duplicate` 카운트에 합산.
4. 중복 여부 판단은 `normalizeUrl` 정규화 후 기준(기존 단건 저장 로직과 동일).

## 데이터 흐름

```
allBookmarks (파싱 결과)
  → MAX_ITEMS 슬라이스 (초과분 skipped)
  → normalizeUrl 적용 + 배치 내부 Set 중복 제거
      → 처음 나온 URL만 통과, 재등장은 duplicate++
  → 남은 URL 목록을 청크(≈200개)로 나눠 DB 배치 조회
      (`select url from bookmarks where user_id = :uid and url in (...)`)
      → 존재하는 URL 집합(existingUrls) 확보
  → existingUrls에 있는 항목 제외 (duplicate++), 나머지만 기존 CHUNK_SIZE 처리 루프(fetchMeta/AI/embedding/upsert)로 진행
```

DB 조회 자체가 실패하면(에러/예외) **fail-open** — 중복 체크를 생략하고 해당 항목들을 기존 경로로 그대로 흘려보낸다. 임포트 전체를 중단시키지 않는다.

## 변경 사항

### 1. 신규 헬퍼: 배치 내부 중복 제거

`items`(파싱+슬라이스 완료 배열)를 순회하며 `normalizeUrl(rawUrl)` 기준 `Set<string>`으로 최초 등장만 유지. 각 항목에 정규화된 `url`을 미리 계산해 붙여서 이후 단계(DB 조회, AI 처리, insert)에서 재계산하지 않는다.

### 2. 신규 로직: 기존 URL 배치 조회

```ts
async function fetchExistingUrls(
  supabase: SupabaseClient,
  userId: string,
  urls: string[],
): Promise<Set<string>> {
  const CHUNK = 200
  const existing = new Set<string>()
  for (let i = 0; i < urls.length; i += CHUNK) {
    const slice = urls.slice(i, i + CHUNK)
    const { data, error } = await supabase
      .from('bookmarks')
      .select('url')
      .eq('user_id', userId)
      .in('url', slice)
    if (error) continue // fail-open — 이 청크만 중복 체크 생략, 전체 중단 안 함
    data?.forEach((row) => existing.add(row.url))
  }
  return existing
}
```

- 여러 청크 중 일부만 실패해도 성공한 청크는 정상적으로 중복 필터링에 반영된다(부분 fail-open).

### 3. 메인 루프 변경

- 배치 내부 dedup → `fetchExistingUrls` 호출 → `existingUrls`에 없는 항목만 기존 `CHUNK_SIZE` 처리 루프 진입.
- `duplicate` 카운터 도입, 두 단계에서 증가.
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
- 개별 항목 처리 중 예외: 기존과 동일하게 `failed++`, 배치 전체는 계속 진행.

## 테스트 계획

`front/app/api/bookmarks/import/__tests__/route.test.ts`에 추가:

1. DB에 이미 있는 URL 재업로드 → `duplicate: 1`, `fetchMeta`/`generateTags`/`createEmbedding` 호출 안 됨, upsert도 호출 안 됨.
2. 같은 파일 안에 동일 URL 2번 등장 → 첫 번째만 upsert 호출, `duplicate: 1`.
3. DB 존재 URL 조회용 supabase mock에서 `select().eq().in()` 에러 반환 → fail-open으로 정상 처리(AI 호출 발생, imported 카운트 정상).
4. 기존 테스트(`정상 임포트`, `folder_hint 보존`, `javascript: URL 스킵` 등)는 응답에 `duplicate: 0` 필드가 추가된 것 외 동작 변화 없음 — 기존 `toEqual({ imported, failed, skipped })` assertion은 `duplicate: 0` 추가해서 갱신.

## 범위 밖

- 단건 저장 라우트(`POST /api/bookmarks`)는 이미 사전 409 체크가 있어 변경 없음.
- Extension 쪽 저장 플로우는 이 API를 그대로 재사용하므로 별도 변경 불필요.
