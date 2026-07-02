# E2E: 카테고리 사이드바 (category-sidebar.md)

전제: 로그인 상태, 북마크 25건 이상 저장 — 그중 "콘텐츠" 카테고리 1건은 **가장 오래된**(최신 20건 밖) 북마크여야 함. (본 회귀 시나리오의 핵심 조건)

관련 변경: `GET /api/bookmarks/categories`, `useCategories`, `Sidebar`, dashboard 빈 상태

## 배경 — 고치는 버그

사이드바 카테고리가 목록 API(`GET /api/bookmarks`)의 `limit=20` 페이지네이션에 묶여, 최신 20건 밖 소수 카테고리(예: 콘텐츠)가 사이드바에서 누락됐다. 카테고리 전용 API(전체 집계)로 분리해 해결.

## 스텝

### A. 카테고리 노출 (회귀 방지)

1. browser_navigate → {base_url}
2. 사이드바 "홈" 탭 활성 상태 확인 (browser_snapshot)
3. 사이드바 카테고리 목록에 **"콘텐츠" 버튼 존재** 확인 — 최신 20건 밖이어도 노출돼야 함
4. 네트워크에 `GET /api/bookmarks/categories` 요청 확인, 응답 `{ categories: [...], hasUncategorized }` 형태 (browser_network_requests)
5. "콘텐츠" 클릭 → 목록이 콘텐츠 북마크로 필터, URL `?category=콘텐츠` 반영

### B. 미분류

6. category_id 없는 북마크가 있으면 카테고리 목록 맨 뒤 "미분류" 노출
7. "미분류" 클릭 → 목록이 미분류 북마크로 필터 (`?category=미분류`)

### C. 즐겨찾기 탭 — 하위 버튼 숨김

8. "즐겨찾기" 탭 클릭
9. "카테고리" 헤더·"전체" 버튼은 유지, **카테고리 이름 하위 버튼(› 개발 등)만 미노출** 확인 (browser_snapshot)
10. "홈" 탭 복귀 → 카테고리 하위 버튼 다시 노출 확인

### D. 빈 상태 멘트 분리

11. 즐겨찾기 0건 상태에서 즐겨찾기 탭 → "**즐겨찾기한 북마크가 없습니다**" + "별표를 눌러 추가" 안내, **추가/업로드 버튼 없음** 확인
12. 북마크 자체가 0건인 신규 계정 홈 탭 → "**저장된 북마크가 없습니다**" + 추가/업로드 CTA 노출 확인 (두 멘트가 분리돼야 함)

## 통과 기준

- 각 스텝 browser_snapshot으로 요소 존재/부재 검증
- 콘솔 에러 0 (browser_console_messages)
- `GET /api/bookmarks/categories` 응답에 embedding·content 등 민감 필드 없음 (browser_network_requests)
- 카테고리 목록이 페이지네이션(limit)과 무관하게 전체 기준으로 노출
