# A62 홈 목록 + 검색 결과 무한스크롤 설계

- 날짜: 2026-07-06
- 대상: `front/hooks/useBookmarks.ts`, `front/hooks/useSearch.ts`, `front/app/api/search/route.ts`, `front/app/(dashboard)/page.tsx`, 신규 `front/components/InfiniteScrollTrigger.tsx` (+ 각 테스트)
- tasks.json: A62 (`front/tasks.json`), 우선순위 medium

## 배경

`GET /api/bookmarks`는 이미 `page`/`limit`/`range()`/`total count`를 구현하고 있다(기본 limit 20, 최대 100). 하지만 프론트 `useBookmarks.ts`가 page/limit 파라미터를 전혀 보내지 않아, 홈 화면은 항상 최신 20개만 보여준다. 즉 A62는 백엔드 신규 구현이 아니라 **이미 있는 backend pagination을 프론트가 소비하지 않는 갭**을 메우는 작업이다.

검색(`POST /api/search`)은 반대로 페이지네이션 개념 자체가 없다 — `match_count: 20` 하드코딩, 항상 top-20만 반환. 검색은 요청마다 OpenAI 임베딩 호출(`createEmbedding`)이 발생하므로, 목록과 같은 방식(스크롤마다 서버 재호출)으로 페이지네이션하면 스크롤할 때마다 불필요한 재임베딩 비용·레이턴시가 발생한다. PRD가 유저당 비용에 민감(A5 가설 $0.02/유저/월)하므로 이 비용을 피하는 설계가 필요하다.

## 목표 동작

두 레인이 서로 다른 메커니즘을 쓴다 — 데이터 특성이 다르므로 억지로 통일하지 않는다.

1. **홈 목록**: 진짜 서버 페이지네이션. 스크롤 하단 도달 시 `page+1`로 서버 재호출, 기존 backend 그대로 소비.
2. **검색**: 클라이언트 사이드 페이지네이션. 서버는 한 번의 임베딩 호출로 top-60을 응답, 스크롤은 이미 받은 배열 안에서 노출 개수만 늘린다 — 추가 네트워크 호출 없음.
3. 두 레인 모두 동일한 트리거 컴포넌트(`InfiniteScrollTrigger`, IntersectionObserver 기반)를 재사용한다.
4. 필터/탭/정렬/새 검색 실행 시 각 레인은 처음(1페이지 / visibleCount 초기값)으로 리셋된다.

## 컴포넌트

### `components/InfiniteScrollTrigger.tsx` (신규, 공용)

```tsx
interface Props {
  onIntersect: () => void
  disabled?: boolean
}
```

- 빈 `div`에 `ref`를 붙이고 `IntersectionObserver`(`rootMargin: '200px'`)로 관찰 — 바닥에 닿기 전에 미리 로드해 체감 지연을 줄인다.
- `disabled`가 true면 관찰하지 않는다(로딩 중이거나 더 가져올 데이터가 없을 때).
- 언마운트 시 `observer.disconnect()`.
- 목록 레인과 검색 레인 양쪽에서 동일하게 사용 — 트리거 로직 중복 없음.

### `hooks/useBookmarks.ts` — `useQuery` → `useInfiniteQuery`

- `queryFn: ({ pageParam }) => fetch('/api/bookmarks?...&page=${pageParam}&limit=20')`
- `initialPageParam: 1`
- `getNextPageParam: (lastPage, allPages) => { const loaded = allPages.flatMap(p => p.bookmarks).length; return loaded < lastPage.total ? allPages.length + 1 : undefined }`
- 필터(`tab`/`category`/`folder`/`tag`) 변경 시 queryKey가 바뀌어 React Query가 자동으로 1페이지부터 다시 시작한다 — 리셋을 위한 별도 코드는 필요 없다.

### `hooks/useSearch.ts` — 슬라이스 레이어 추가

- 서버 응답(top-60, 아래 참고)을 그대로 받되, 로컬 `visibleCount` state(초기값 `SEARCH_PAGE_SIZE = 20`)로 노출 구간을 관리한다.
- 새 검색이 성공(`onSuccess`)할 때마다 `visibleCount`를 `SEARCH_PAGE_SIZE`로 리셋 — 이전 검색의 스크롤 진행이 다음 검색에 남지 않는다.
- 반환값에 `visibleResults`(slice된 배열), `hasMore`(`visibleCount < all.length`), `showMore`(`visibleCount += SEARCH_PAGE_SIZE`)를 추가로 노출한다.
- 기존 `mutate`/`isPending`/`isError` 등 useMutation 반환값은 그대로 유지 — 소비하는 쪽(`page.tsx`) 호환.

### `app/api/search/route.ts` — `match_count` 상수만 변경

- `match_count: 20` → `match_count: 60`. RPC 파라미터 이름·구조는 그대로, 값만 조정.
- 벡터 검색은 top-K 밖으로 갈수록 관련성이 급락한다(A55에서 이미 top-K 랭킹 철학을 채택) — 60개면 대부분의 검색 의도를 커버하고, 그 이상 스크롤은 사용자도 거의 안 한다. 무제한 재호출 대신 "충분히 큰 고정 K"로 마무리한다.

### `(dashboard)/page.tsx`

- 렌더 소스 교체: 목록 모드는 `bookmarksQuery.data.pages.flatMap(p => p.bookmarks)`, 검색 모드는 `search.visibleResults`.
- 리스트 마지막에 `<InfiniteScrollTrigger onIntersect={...} disabled={...} />` 하나 추가 — grid/list/compact 3개 뷰 모두 레이아웃 클래스는 그대로 두고 sentinel만 마지막 자식으로 둔다(뷰별 특수 처리 불필요).
- 로딩 표시: 목록은 `isFetchingNextPage`일 때만 하단에 작은 스피너("더 불러오는 중") 노출. 검색은 네트워크 호출이 없으므로 스피너 없이 즉시 반영.

## 에러 처리

- 목록 다음 페이지 요청 실패: 전체 화면 에러(`isBookmarkError`)와 구분되는 하단 소형 에러 — "더 불러오지 못했습니다" + 재시도 버튼. 이미 로드된 목록은 유지한다.
- 검색: `showMore`는 로컬 배열 슬라이스일 뿐 네트워크 호출이 없으므로 이 단계에서 실패 케이스가 존재하지 않는다. 초기 검색 자체의 실패는 기존 `isSearchError` 처리를 그대로 사용한다.

## 알려진 한계 (이번 스코프 아님, 명시)

- 가상 스크롤(예: react-window)은 도입하지 않는다. 북마크 수천 건이 쌓이면 DOM이 무거워질 수 있으나, 현재 유저 규모에서는 불필요 — v2.0에서 실측 후 재검토.
- 뒤로가기 시 스크롤 위치 복원은 구현하지 않는다(YAGNI).
- 검색은 top-60을 넘어가면 "더 이상 없음" 상태로 종료된다 — 벡터 검색 특성상 그 이상은 관련성이 낮아 페이지네이션 대상으로 보지 않는다.

## 테스트

- `useBookmarks.test.ts`: fetch를 페이지별로 mock, `getNextPageParam`이 누적 개수가 `total`에 도달하면 `undefined`를 반환하는지 확인.
- `useSearch.test.ts`: `visibleCount` 슬라이스, `showMore` 증가, 새 검색 실행 시 리셋 동작을 확인(네트워크 mock 불필요, 순수 상태 로직).
- `InfiniteScrollTrigger.test.tsx`: IntersectionObserver를 mock해 교차 시 `onIntersect` 호출, `disabled`일 때 미호출을 확인.
- 수동 확인: 홈에서 20개 넘게 스크롤 → 2페이지 요청이 devtools network 탭에 찍히는지 확인. 검색 후 스크롤 → **추가 fetch 없이** 결과 노출 개수만 늘어나는지 확인.
