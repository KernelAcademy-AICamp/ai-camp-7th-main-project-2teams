# 태그 alias 관리

**관련 태스크**: A5

AI 태깅 출력 정규화용. 운영 중 누락 발견 시 이 파일에 추가.

---

> **단일 출처**: 실제 alias 매핑 전체는 `front/lib/tag-alias.ts`. 이 문서는 개념·정책만 기술하고 키-값 목록은 중복 보관하지 않는다(드리프트 방지). 운영 중 누락 발견 시 코드에 추가.

## 대분류 (categories 매핑)

`CATEGORY_ALIAS` — `tags[0]`을 `categories` 테이블 name으로 정규화. 고정 13개(`TOP_CATEGORIES`) 외 값은 `null` (미분류).

| 대분류 | 비고 |
|--------|------|
| 개발 · AI/ML · 디자인 · 비즈니스 · 학습 · 쇼핑 | MVP 6종 |
| 커뮤니티 | 포럼·SNS·Q&A — 토론·소통 목적 사이트 |
| 콘텐츠 | 블로그·매거진·뉴스레터·RSS — 읽을거리 |
| 브랜드 | 마케팅·기업 — 브랜드 소개·캠페인 |
| 게임 | 공략·e스포츠·게임뉴스·게임리뷰 |
| 라이프스타일 · 여행 · 금융 | 일상·여행·자산 — 경계 규칙은 tag-taxonomy.md |

영문·약어·동의어(dev→개발, community→커뮤니티 등)를 한국어 대분류로 매핑. 전체 키는 코드 참조.

---

## 중분류 alias

`TAG_ALIAS` — `tags` 배열 정규화용. 소분류는 자유 텍스트 — alias 없음. 중분류 목록은 `docs/specs/tag-taxonomy.md` 분류 트리, 매핑 키는 `front/lib/tag-alias.ts` 참조.

설계 규칙:
- 범용어(`가이드`·`walkthrough`·`company` 등)는 alias 금지 — 컨텍스트 무시 일대일 치환이라 타 영역 오분류 유발.
- `TAG_ALIAS` ∩ `CATEGORY_ALIAS` 키는 공집합이어야 함(`normalizeTags`가 TAG_ALIAS 우선 조회 → 충돌 시 CATEGORY_ALIAS 무효화). 단위 테스트로 가드.

---

## 적용 함수

```typescript
const TOP_CATEGORIES = new Set(['개발', 'AI/ML', '디자인', '비즈니스', '학습', '쇼핑', '커뮤니티', '콘텐츠', '브랜드', '게임', '라이프스타일', '여행', '금융'])

export function normalizeTags(tags: string[]): string[] {
  return tags.map(t => TAG_ALIAS[t] ?? CATEGORY_ALIAS[t] ?? t)
}

// AI 태깅 직후: normalizeTags 거친 배열에서 대분류 토큰을 찾아 제거 — 나머지는 중분류(midTags)로 확정
export function extractTopCategory(normalizedTags: string[]): { category: string | null; midTags: string[] } {
  const idx = normalizedTags.findIndex(t => TOP_CATEGORIES.has(t))
  if (idx === -1) return { category: null, midTags: normalizedTags }
  return { category: normalizedTags[idx], midTags: normalizedTags.filter(t => !TOP_CATEGORIES.has(t)) }
}

// A60: 사용자가 PATCH로 직접 입력한 대분류명(별칭 포함)을 표준 대분류명으로 해석. 13종 외는 null(400 처리용)
export function resolveTopCategory(input: string): string | null {
  const resolved = CATEGORY_ALIAS[input] ?? input
  return TOP_CATEGORIES.has(resolved) ? resolved : null
}
```

**사용 위치**: `extractTopCategory`는 `app/api/bookmarks/route.ts`(AI 태깅 직후) · `app/api/bookmarks/import/route.ts`(일반 브라우저 임포트분). `resolveTopCategory`는 `app/api/bookmarks/[id]/route.ts`(A60 PATCH 카테고리 수정) · import route(자체 내보내기 HTML의 DATA_CATEGORY 복원분 — 이미 대소분류 분리돼 있어 재분리 불필요, 유효성 검증만).

---

## alias 추가 기준

- AI 출력에서 반복적으로 발견되는 비정규 표현
- 동일 개념의 영문/한문 혼용
- 소분류(고유명사)는 추가하지 않음
