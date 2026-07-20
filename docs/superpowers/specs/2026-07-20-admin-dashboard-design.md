# /admin 내부 대시보드 — 설계 문서

**날짜**: 2026-07-20
**상태**: 설계 확정 대기 (사용자 리뷰 게이트)
**연관**: `prd.md §4`(OKR), `business-viability.md §2`(비용 실측 부채), `scripts/mvp-dashboard.md`(Input·Output·Owner 보드)

---

## 1. 목적

출시 직후 그로스 국면에서 팀이 여는 **내부 운영 대시보드**. 세 목적을 한 화면에 묶는다:

1. **보드 Output 자동화** — `mvp-dashboard.md`의 Output 컬럼(MAU·저장 완료율 등)을 수기 추정에서 실측으로 전환.
2. **AI 비용 실측** — `business-viability.md`가 "인용치, 실측 필요"라 못박은 유저당 $0.02를 실제 청구 데이터로 검증.
3. **데이터 품질 감시** — 미분류율·dead link율을 보고 `category-backfill` 등 운영 스킬 실행을 판단.

**성격**: 사용자향 A64(개인 대시보드)와 무관. 관리자 전용.

---

## 2. 시나리오

> 월요일 그로스 리뷰. PM이 보드 Output을 채우러 `/admin`을 연다. OKR 타일에 활성 사용자·첫 저장 완료율·1인당 저장이 자동 계산돼 있어 그대로 복사한다. 개발 리드가 "AI 비용 괜찮냐" 묻자 OpenAI 사용량 위젯의 이번 달 실제 $를 $0.02 가정선과 비교한다. 카테고리 원형에서 미분류 18%를 확인, 슬라이스를 눌러(모달) 하위 태그를 보고 `category-backfill` 실행 여부를 정한다.

---

## 3. 아키텍처

```
front/app/admin/
  page.tsx                  # 서버 컴포넌트 셸 + 섹션 조립
  components/
    OkrTiles.tsx            # [A] OKR 실측 타일
    OpenAiUsage.tsx         # [B] OpenAI Usage API 위젯
    CategoryPie.tsx         # [C] 카테고리 원형 + 1d/7d/30d 탭
    CategoryDrilldownModal.tsx # [D] URL 동기화 모달 (하위 태그 원형)
    DataHealth.tsx          # [E] 데이터 건강도 (Phase 2)

front/app/api/admin/
  stats/route.ts           # GET — 집계 지표 (service role)
  openai-usage/route.ts    # GET — OpenAI Usage API 프록시

front/lib/
  admin-auth.ts            # withAdmin HOF (allowlist 게이팅)
```

### 3.1 관리자 게이팅 (`withAdmin`)

- `withAuth` 위에 얹는 HOF. 로그인 유저의 `user.id`가 `ADMIN_USER_IDS`(환경변수, 쉼표구분 allowlist)에 없으면 **404** 반환(존재 은닉).
- `ADMIN_USER_IDS`는 `NEXT_PUBLIC_` 금지 — 서버 전용.
- `/admin` page.tsx도 서버에서 동일 검사 후 미허용 시 `notFound()`.

### 3.2 집계 원칙 (RLS 우회 + 노출 금지)

- 전체 사용자 집계는 RLS를 우회해야 하므로 **`SUPABASE_SERVICE_ROLE_KEY`** 서버 클라이언트로만 실행.
- **집계값만 반환.** 개별 북마크 행·유저 식별자·`embedding`·`content`·`description` 절대 미포함.
- `select('*')` 금지 → 필요한 컬럼만 (`category_id`, `tags`, `created_at`, `is_dead`).

---

## 4. 섹션별 설계

### [A] OKR 실측 타일 — 보드 Output 자동화

**MVP (기존 데이터로 즉시 계산):**

| 타일 | 정의 (범위 = 1d/7d/30d) | 소스 |
|---|---|---|
| 활성 사용자 | 기간 내 북마크 저장한 distinct `user_id` (MAU 대리지표) | bookmarks |
| 첫 저장 완료율 | 기간 내 가입자 중 북마크 ≥1건 보유 비율 | auth.users JOIN bookmarks |
| 1인당 저장 건수 | 기간 저장 수 / 활성 사용자 | bookmarks |
| 신규 저장 수 | 기간 내 생성 북마크 총계 | bookmarks |

**Phase 2 (계측 추가 필요 — 스펙 명시, 이번 구현 범위 밖):**

| 타일 | 필요 계측 |
|---|---|
| 검색 사용률 (O3) | A7 `/api/search`에 append-only `search_events`(user_id, created_at) 로깅 추가 |
| p95 태깅 응답시간 (O1-KR2) | A5 파이프라인 타이밍 로그 추가 |

> MVP 타일에는 "활성 사용자 = 저장 기준 대리지표"임을 UI에 명시(툴팁). 정확한 MAU는 인증 이벤트 로깅 후 보정(Phase 2).

### [B] OpenAI 사용량 — Usage API

- **소스**: OpenAI Organization Usage/Costs API (`/v1/organization/costs`, `/v1/organization/usage/completions`).
- **인증**: `OPENAI_ADMIN_KEY`(신규 환경변수, **서버 전용**, `OPENAI_API_KEY`와 별개인 admin/org 키). `NEXT_PUBLIC_` 금지.
- **표시**: 기간 총 비용($) · 총 토큰 · 모델별 분해(gpt-4o-mini / text-embedding-3-small).
- **유저당 비용**: `총 비용 / 활성 사용자`로 **추정** → $0.02 가정선 오버레이. Usage API는 계정 단위·조대하므로 "유저당 = 추정치"임을 UI 명시.
- **호출 방식**: `/api/admin/openai-usage`가 서버에서 프록시(키 노출 방지). 캐시 권장(사용량 API rate limit·지연 고려, 예: 15분 revalidate).
- **폴백**: Usage API 실패/키 미설정 시 위젯에 "사용량 조회 불가" 명시적 표기(무음 실패 금지).

### [C] 카테고리 비율 원형 그래프 + 1d/7d/30d 탭

- **쿼리**: `bookmarks LEFT JOIN categories ON category_id` → `GROUP BY categories.name`, `category_id IS NULL` → **"미분류"** 버킷.
  - ⚠️ `categories`는 유저별 테이블이므로 **반드시 `name` 기준 집계**(같은 이름이 유저마다 다른 row).
- **필터**: `created_at >= now() - interval '{range}'`. 탭(1d/7d/30d) 전환 시 [B][C] 동시 갱신.
- **차트**: 원형(파이/도넛). 각 슬라이스 = 카테고리별 북마크 수 %.
- **인터랙션**: 슬라이스 클릭 → [D] 드릴다운 모달.

### [D] 하위 태그 드릴다운 — URL 동기화 모달

- **UX 결정**: URL 동기화 모달. 슬라이스 클릭 시 `?category=<name>&range=<range>` 쿼리 세팅 → 모달 오픈.
  - 새로고침·공유 시 모달 상태 복원. 뒤로가기(또는 배경 클릭)로 닫힘.
  - Next.js App Router: `searchParams` 기반 조건부 렌더 (인터셉팅 라우트는 과함, 쿼리 파라미터로 충분).
- **쿼리**: 해당 카테고리(name)에 속한 북마크의 `unnest(tags)` → 태그별 카운트 → %.
  - 태그는 대/중/소가 배열에 평면 저장 → unnest 카운트가 자연스러움.
- **차트**: 동일 원형 컴포넌트 재사용(부모 원형과 시각 일관성).

### [E] 데이터 건강도 (Phase 2 — 동일 인프라 확장)

같은 `/api/admin/stats` 쿼리에 얹어 확장:

| 위젯 | 연결점 |
|---|---|
| 미분류율 추이 | `category-backfill` 스킬 실행 트리거 ([C]에서 이미 미분류 버킷 노출) |
| Dead link 비율 (`is_dead`) | A66 죽은 링크 감지 연계 |
| 일별 신규 저장 시계열 | 성장 국면 파악 |
| 검색 제로결과 쿼리 로그 | `cross-lingual-search-alias` 스킬 트리거 (검색 로깅 후) |

---

## 5. 데이터 계약 (API 응답)

```ts
// GET /api/admin/stats?range=1d|7d|30d
{
  range: '7d',
  okr: {
    activeUsers: number,        // 저장 기준 대리지표
    firstSaveRate: number,      // 0~1
    savesPerUser: number,
    newSaves: number,
  },
  categories: Array<{ name: string, count: number, pct: number }>, // '미분류' 포함
  // 개별 행·user_id·embedding·content 없음
}

// GET /api/admin/stats?range=7d&category=개발  → 드릴다운
{ range, category: '개발', tags: Array<{ tag: string, count: number, pct: number }> }

// GET /api/admin/openai-usage?range=30d
{ range, totalCostUsd: number, totalTokens: number,
  byModel: Array<{ model: string, tokens: number, costUsd: number }>,
  estCostPerUser: number, available: boolean }
```

---

## 6. 보안 체크리스트

- [ ] `withAdmin` allowlist 게이팅, 미허용 404
- [ ] 집계 쿼리만 service role 사용, 개별 행 미반환
- [ ] `embedding`·`content`·`description`·`user_id` 응답 미포함
- [ ] `select('*')` 미사용, 명시 컬럼만
- [ ] `ADMIN_USER_IDS`·`OPENAI_ADMIN_KEY`·`SERVICE_ROLE_KEY` 서버 전용, `NEXT_PUBLIC_` 없음
- [ ] OpenAI 키 클라이언트 미노출(서버 프록시 경유)
- [ ] Usage API 실패 시 명시적 오류 표기(무음 실패 금지)

---

## 7. 테스트

- **단위**: 집계 유틸(카테고리 % 계산, unnest 태그 집계, range→interval 매핑), `withAdmin` 게이팅 분기.
- **통합**: `/api/admin/stats` — allowlist 유저 200 / 비allowlist 404 / 응답에 금지 컬럼 부재 검증.
- **E2E**: `/admin` 진입(관리자) → 탭 전환 → 슬라이스 클릭 → 모달 URL 쿼리 반영 → 새로고침 시 모달 복원. 비관리자 `/admin` 404.

---

## 8. 범위 밖 (YAGNI)

유저별 상세 행 조회, 실시간 스트리밍, 자체 OpenAI 계측(Usage API 선택으로 대체), 화려한 애니메이션.

---

## 9. 결정 로그

- 드릴다운 UX = **URL 동기화 모달** (연속 탐색 + 공유 가능)
- OpenAI 사용량 = **OpenAI Usage API** (실제 청구, `OPENAI_ADMIN_KEY` 서버 프록시)
- 검색 사용률·p95 응답시간 = 계측 부재 → **Phase 2**로 분리
