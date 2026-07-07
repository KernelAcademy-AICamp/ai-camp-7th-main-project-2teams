# description 기본 저장 + 임베딩용 content(2000자) 분리 설계

- 날짜: 2026-07-07
- 대상 파일: `front/lib/fetchMeta.ts`, `front/app/api/bookmarks/route.ts`, `front/app/api/bookmarks/import/route.ts` (+ 테스트)
- 범위: 북마크 생성 경로(단건 추가·임포트)의 description 저장 + embedding 입력 텍스트. 검색(`match_bookmarks` RPC)·DB 스키마는 변경 없음(이미 title+tags+description 트라이그램 + embedding 벡터를 RRF로 병합 중이라, description만 채워지면 통합검색은 자동으로 동작).

## 배경

현재 세 경로(단건 추가/HTML 임포트/카카오 CSV 임포트) 모두 `description` 컬럼을 저장하지 않는다 — `fetchMeta`나 사용자 content로 확보한 og:description은 태깅·임베딩 입력으로만 쓰고 버려진다. 결과:

1. 카드 UI에 description이 거의 안 뜬다(사용자가 수정 모달에서 직접 입력하지 않는 한 항상 비어있음).
2. embedding 입력이 og:description(최대 1000자, 있으면)뿐이거나 title뿐이라 검색 벡터가 약하다.
3. 단건 추가 라우트는 익스텐션이 `content`(og:description+body innerText, 2000자 상한)를 보내면 `fetchMeta` 자체를 호출하지 않아 — thumbnail_url이 항상 null로 남는 부수 버그가 있다.

익스텐션(`extension/background/index.js:33-39`)은 이미 원하는 알고리즘을 구현해뒀다:

```js
const description = meta('meta[property="og:description"]') || meta('meta[name="description"]')
const body = (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim()
const content = [description, body].filter(Boolean).join('\n').slice(0, 2000)
```

서버 쪽(fetchMeta 없는 경로: 임포트, 단건 추가의 fetchMeta 폴백)에도 동일 알고리즘을 복제해 일관성을 맞춘다.

## 목표 동작

1. **description 컬럼**: 모든 생성 경로에서 기본으로 저장. 값은 언제나 `fetchMeta`가 추출한 og:description(짧은 요약, 최대 1000자) — 카드 표시·트라이그램 검색용. 사용자가 이후 수정 모달로 덮어쓸 수 있는 기존 동작(A60)은 유지.
2. **embedding 입력 텍스트(`content`)**: DB에 저장하지 않고 요청 스코프 안에서만 사용 후 파기(기존 privacy 원칙 유지). 소스 우선순위:
   - 단건 추가: 익스텐션이 보낸 `content`(비어있지 않으면) 우선, 없으면 `fetchMeta`가 새로 반환하는 `content` 필드로 대체.
   - 임포트(HTML/CSV): 항상 `fetchMeta`의 `content` 필드(익스텐션 경로가 없음).
   - `content` 값 자체는 항상 2000자 상한(익스텐션·서버 양쪽 동일 규칙).
3. **단건 추가 라우트는 항상 `fetchMeta`를 호출**한다(현재는 `content`가 있으면 스킵) — description·thumbnail_url 확보가 content 유무와 무관해지므로. title 폴백(`meta.title`)은 기존처럼 "익스텐션이 content를 못 가져온 경우(차단된 페이지 등)"에만 적용 — 익스텐션이 정상 캡처했으면 `document.title`을 더 신뢰.
4. 검색 코드/RPC 변경 없음 — description이 채워지면 기존 `match_bookmarks`가 자동으로 title+tags+description 트라이그램과 embedding 벡터를 함께 사용.

## 변경 사항

### 1. `lib/fetchMeta.ts` — `content` 필드 추가 + HTML 엔티티 디코드

반환 타입 확장:

```ts
export async function fetchMeta(url: string): Promise<{
  title: string
  description: string
  thumbnailUrl: string
  content: string   // 신규 — og:description + body 텍스트, 2000자 상한
}>
```

- 이미 fetch한 `html`에서 `<script>...</script>`, `<style>...</style>` 제거 → 남은 태그 전부 제거 → 공백 정규화.
- `[description, bodyText].filter(Boolean).join('\n').slice(0, MAX_CONTENT_LENGTH)` — 익스텐션과 동일 공식. `MAX_CONTENT_LENGTH = 2000` 상수로 선언(익스텐션 쪽 매직넘버와 값은 같지만 코드 공유는 안 됨 — 값 바꿀 때 양쪽 다 수정 필요하다는 주석 남김).
- YouTube oEmbed 경로(`fetchYouTubeOEmbed`)는 body HTML이 없으므로 `content = description`(채널명 텍스트)으로 대체 — 기존 임베딩 품질 유지.
- 덤 수정: `extractMetaContent`가 뽑아온 raw content의 HTML 엔티티(`&amp;`, `&quot;`, `&#x2705;` 등)를 디코드하는 최소 헬퍼 추가(이전에 발견된 버그, 같은 파일 손보는 김에 처리). 이름 있는 엔티티 5종(`&amp; &lt; &gt; &quot; &#39;`) + 숫자/16진 참조(`&#NNN;`, `&#xHEX;`) 정규식 치환. title/description/content 모두에 적용.

### 2. `app/api/bookmarks/route.ts` (단건 추가)

```ts
let { title, content } = parsed.data
const hasExtensionContent = content.trim() !== ''

const meta = await fetchMeta(url)   // 항상 호출 (기존: content 있으면 스킵)
if (!hasExtensionContent && meta.title) title = meta.title
const description = meta.description || null
const thumbnailUrl = isSafeHttpUrl(meta.thumbnailUrl) ? meta.thumbnailUrl : null
const embeddingContent = hasExtensionContent ? content : meta.content
const hasContent = embeddingContent.trim() !== ''
```

- `generateTags({ title, url, description: embeddingContent })`, `createEmbedding(hasContent ? \`${title}\n${embeddingContent}\` : title)` — 변수명만 `content` → `embeddingContent`로 바뀌고 로직은 기존과 동일.
- insert에 `description` 필드 추가.
- 부수 효과: 익스텐션 경로에서도 이제 `fetchMeta`가 항상 돌기 때문에 thumbnail_url이 채워진다(기존 버그 수정).

### 3. `app/api/bookmarks/import/route.ts`

- 기존 `title` 승격 로직(`parsedTitle === url && meta.title` — 지난 턴에 이미 적용됨) 유지.
- `description = meta.description || undefined`는 유지하되, upsert에 `description: description ?? null` 추가.
- embedding/tagging 입력을 `description` → `meta.content`로 교체:
  ```ts
  const embeddingContent = meta.content || undefined
  const tagsPromise = htmlTags ? Promise.resolve(htmlTags) : generateTags({ title, url, description: embeddingContent })
  const [tagsResult, embeddingResult] = await Promise.allSettled([
    tagsPromise,
    createEmbedding(embeddingContent ? `${title}\n${embeddingContent}` : title),
  ])
  ```

### 4. 검색

변경 없음. `match_bookmarks` RPC가 이미 `title`, `tags`, `description` 트라이그램 + `embedding` 벡터를 RRF로 병합 중 — description이 채워지는 순간 자동으로 통합검색 대상이 된다.

## 에러 처리

- `fetchMeta`는 기존처럼 throw하지 않음(실패 시 모든 필드 빈 문자열) — `content`도 실패 시 `''`, embedding은 title-only로 degrade(기존 패턴).
- 단건 추가 라우트에서 `fetchMeta` 호출이 항상 발생하게 되면서 응답 지연이 소폭 늘 수 있음(외부 fetch 1회, 5s 타임아웃 캡 — 기존 임포트 경로와 동일한 수준). 실패해도 title/description/thumbnail 각각 개별 폴백이라 전체 실패로 이어지지 않음.

## 테스트 계획

`lib/__tests__/fetchMeta.test.ts`:
1. 정상 HTML(`<script>`, `<style>` 포함) → `content`에 스크립트/스타일 텍스트 안 섞이고 body 텍스트만 포함, 2000자 이하.
2. `content`가 2000자 초과하는 body를 가진 페이지 → 정확히 2000자로 잘림.
3. og:description 없고 body만 있는 페이지 → `content` = body 텍스트만.
4. HTML 엔티티 포함 title/description(`&amp;`, `&#x2705;`) → 디코드된 값 반환.
5. YouTube oEmbed 경로 → `content` = `description`(채널명 텍스트)과 동일.

`app/api/bookmarks/__tests__/route.test.ts`:
6. 익스텐션이 `content` 보낸 경우 → `fetchMeta` 호출됨(현재 테스트가 "content 있으면 fetchMeta 안 호출" 기대하면 그 assertion 제거/수정 필요), insert에 `description: meta.description` 포함, thumbnail_url도 채워짐.
7. `content` 없는 경우(기존 동작) → 기존과 동일하게 `meta.content`가 embedding 입력으로 쓰임.

`app/api/bookmarks/import/__tests__/route.test.ts`:
8. upsert 호출 payload에 `description` 필드 포함 검증(기존 테스트들의 upsert 호출 assertion 갱신).
9. embedding 입력이 `meta.content` 기반인지 검증(기존에 `meta.description` 기반이던 assertion 갱신).

## 범위 밖

- PATCH `/api/bookmarks/:id`의 재임베딩 로직(`reembedIfDescriptionChanged`)은 변경 없음 — 사용자가 수정 모달에서 description을 직접 편집한 경우는 원본 body content가 이미 파기된 상태라 여전히 `title+description` 기반 재임베딩이 최선.
- 기존 저장분(이미 title=url 백필 완료, description 대부분 비어있는 상태) 백필은 이번 스펙 범위 밖 — 필요하면 별도 스펙.
