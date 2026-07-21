# 지표 스펙 — North Star + 이벤트 계측

**관련 파일**: `supabase/migrations/0030_events.sql`, `supabase/migrations/0031_metrics_aggregation.sql`, `front/lib/events.ts`, `front/app/api/events/route.ts`, `front/app/api/bookmarks/route.ts`, `front/app/api/search/route.ts`, `front/app/(dashboard)/page.tsx`, `front/app/api/admin/metrics/route.ts`, `front/components/admin/NorthStarMetrics.tsx`

서비스 핵심 가치: **"저장은 편리하게, 관리/검색은 간편하게"**. 비즈니스 게임 = Productivity(저장한 걸 얼마나 효율적으로 되찾는가).

---

## North Star Metric

### 🎯 주간 되찾은 북마크 수 (Weekly Retrieved Bookmarks)

> 한 주간 유저가 검색·태그 필터·자연어 검색으로 **이전 저장 북마크를 열람(클릭)한 총 횟수**.

**선정 이유**: 북마크 서비스 최대 적 = "북마크 무덤"(저장만 하고 안 씀). 저장은 입력, **재사용이 진짜 가치**. NSM을 재사용에 고정해 무덤을 방지한다.

7기준 충족: 이해쉬움 · 고객중심 · 지속가치(습관) · 비전정렬 · 정량 · 실행가능 · 선행지표(리텐션→유료전환).

```
주간 되찾은 북마크 = 활성 큐레이터 × 주간 검색 횟수 × 검색 성공률
```

---

## Input Metrics (NSM 구동 4종)

| # | 지표 | 정의 | Baseline(가정) | 90일 목표 |
|---|------|------|:---:|:---:|
| 1 | 주간 신규 저장 | 유저당 주간 저장 수(중앙값) | 3건/주 | 6건/주 |
| 2 | AI 자동분류 커버리지 | 자동 태그·카테고리 배정 비율 | 70% | 90% |
| 3 | 검색 성공률 | 검색→클릭 전환 % | 40% | 65% |
| 4 | 주간 활성 큐레이터 | 주 2회↑ 저장+검색 유저 수 | MAU 8% | MAU 15% |

> ⚠️ Baseline 전부 **업계 프록시 가정**. 실 데이터 아님. 계측 2주 관측 후 실측 중앙값으로 **반드시 교체**. 목표를 가정치에 고정 금지.

### NSM 목표 환산 (가정 기준)

| | Baseline | 90일 목표 |
|---|:---:|:---:|
| 활성 큐레이터 | 80명 | 150명 |
| ×주간 검색 | 4회 | 5회 |
| ×성공률 | 40% | 65% |
| **주간 되찾음** | **~128** | **~488** (3.8배) |

---

## 이벤트 계측

### 테이블 `events` (0030)

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | bigint identity PK | |
| `user_id` | uuid FK→auth.users | on delete cascade |
| `type` | text | 이벤트 4종 |
| `meta` | jsonb | **embedding·content 등 민감정보 금지** |
| `created_at` | timestamptz | default now() |

인덱스: `(type, created_at desc)`, `(user_id, created_at desc)` — 주간 집계용.
RLS: 활성. authenticated는 본인 `user_id`만 insert. **조회는 service_role 전용**(select 정책 없음 = 기본 거부).

### 이벤트 4종

| type | 기록 지점 | 위조방지 | meta |
|------|----------|---------|------|
| `bookmark_saved` | `POST /api/bookmarks` insert 성공 후 | 서버 전용 | `{ has_content }` |
| `tag_assigned` | 동상(1 insert 배치) | 서버 전용 | `{ source:'auto', auto_category, tag_count }` |
| `search_performed` | `POST /api/search` 결과 반환 전 | 서버 전용 | `{ result_count }` |
| `search_result_clicked` | 대시보드 검색 결과 클릭 → `POST /api/events` | 클라 허용(위조 무해), `CLIENT_LOGGABLE` 화이트리스트 | `{ bookmark_id, rank }` |

**설계 원칙**:
- 분석 이벤트는 **절대 UX를 막지 않음** — `logEvents` 실패 삼킴, 요청은 정상 진행 (`front/lib/events.ts`).
- 서버 이벤트(저장·검색)는 서버 성공 시점에만 기록 → 위조 차단. 클라 로깅은 `search_result_clicked`만 화이트리스트 허용.
- 클라 클릭은 `fetch(keepalive:true)` — 새 탭/네비게이션에도 전송 생존.

### 지표 ← 이벤트 매핑

| Input 지표 | 집계 |
|-----------|------|
| 신규 저장 | 주간 `bookmark_saved` count |
| 자동분류 커버리지 | `tag_assigned` 중 `meta.auto_category=true` 비율 |
| 검색 성공률 | `search_result_clicked` / `search_performed` |
| 활성 큐레이터 | 주간 `bookmark_saved`+`search_performed` 동시 발생 유저 수 |
| **NSM: 되찾은 북마크** | 주간 `search_result_clicked` count |

---

## 운영 절차 (실측 전환)

1. 배포 → 이벤트 자동 적재 시작(테이블 준비 완료).
2. **2주 관측** → 실제 중앙값이 진짜 baseline. 위 가정치 폐기.
3. 목표 재조정: 실측 baseline × 성장계수(초기 Productivity SaaS 분기 1.5~2배 현실적).
4. 집계는 `admin_metrics_weekly(p_weeks)` RPC(0031, service_role 전용) — 주간 5지표 별자리 반환. 관리자 대시보드 위젯 연동은 별도 태스크.

## 미구현 (backlog)

- 수동 재태깅(카드 편집) `tag_assigned{source:'manual'}` — 자동 대비 수동 교정률 측정용.

> 관리자 대시보드 위젯 완료: `GET /api/admin/metrics` + `NorthStarMetrics`(성장 지표 탭, 주간 8주 별자리) — `admin_metrics_weekly`(0031) 소비.
- 코호트별·유료/무료 세그먼트 분리 목표.
