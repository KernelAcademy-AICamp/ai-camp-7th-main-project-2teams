# /admin 대시보드 v2 재정의 — 설계 스펙

**작성일**: 2026-07-20
**태스크**: A67 후속 (내부 운영 도구, PRD 범위 밖)
**전제**: 기존 `/admin`(집계 전용, PII 미노출)을 마케팅·유저관리·북마크 동향 관리 용도로 재정의.

---

## 1. 목표

세 가지 운영 니즈를 한 페이지에서 충족:

1. **마케팅** — 신규 가입/저장 성장 추이, 트렌딩 태그(콘텐츠 소재), 활성화 퍼널 근거 지표
2. **유저 관리** — 관리자 승격/강등을 UI로 (현재 수동 SQL만 가능)
3. **북마크 동향** — 카테고리 분포 + 시간 동향, AI 품질(데드링크·미분류) 건강 지표

**비목표 (Phase 2, 이번 범위 밖 명시)**: 코호트 리텐션, 데이터 export, 개별 유저 활동 PII 테이블(이메일·개인 북마크 목록). 프라이버시 정책상 개별 유저 행 노출은 보류.

---

## 2. 차트 정책 변경 (핵심)

**도넛(원형) 전면 폐기.** 사유:
- 유저 자유입력 카테고리 → 슬라이스 다수 → 6~7개 넘으면 판독 불가
- 슬라이스 간 크기 비교 부정확
- **시간 동향 표현 불가** — "동향 관리" 목적과 상충

교체:
- **분포** → 랭킹 가로막대(`BarList`). 라벨 판독 명확, 정렬로 우선순위 즉시 파악. CSS `width:%` 막대(recharts 불필요, 경량).
- **동향** → 시계열 영역그래프(`GrowthChart`). recharts `AreaChart` 재사용.

`DonutChart.tsx`는 은퇴. 드릴다운 모달도 `BarList` 재사용(카테고리→하위 태그 분포 동일 표현).

---

## 3. 레이아웃

Mowaba 라이트 디자인 시스템 준수(DESIGN.md). 이탤릭 금지. `max-w-5xl` 유지.

```
┌ 헤더: "관리자 대시보드" + 기간탭 [1d|7d|30d] ────────────┐
├ 핵심 타일 (4): 활성 사용자 · 신규 가입 · 첫저장 완료율 · 1인당 저장 ┤
├ 성장 추이 (영역그래프): 신규 가입 + 저장 시계열 ─────────┤
├ 콘텐츠 동향 (2열):                                       │
│   좌: 카테고리 분포 랭킹막대(클릭→드릴다운)                │
│   우: 트렌딩 태그 (급상승 delta 표시)                     │
├ 하단 (2열): 건강 지표(데드링크·미분류 비율) | OpenAI 비용   ┤
├ 관리자 관리: 현재 관리자 목록 + 이메일 승격 폼 + 강등 버튼   ┤
└──────────────────────────────────────────────────────┘
```

기간탭·드릴다운 상태는 기존대로 URL 쿼리(`range`, `category`)로 관리.

---

## 4. 데이터 계층 — 신규 RPC

전부 기존 0026 보안 패턴 답습: `security definer` + `set search_path = public`, **`service_role`에만 `grant execute`**, `PUBLIC`/`anon`/`authenticated`는 명시적 `revoke`. 반환은 집계값·관리자 이메일만 — `embedding`/`content`/개별 유저 북마크 미노출.

버킷 규칙: `1d`=시간별, `7d`/`30d`=일별. `generate_series`로 빈 버킷 0-채움(연속 그래프).

| RPC | 시그니처 | 반환 | 비고 |
|---|---|---|---|
| `admin_growth_series` | `(p_interval text)` | `(bucket timestamptz, signups bigint, saves bigint)` | auth.users + bookmarks 버킷 집계 |
| `admin_trending_tags` | `(p_interval text)` | `(tag text, count bigint, prev_count bigint)` | 직전 동일 윈도우 대비 delta 정렬, top 10 |
| `admin_health_stats` | `()` (무인자, 전체기간) | `(dead_ratio numeric, uncategorized_ratio numeric)` | 데드링크·미분류 누적 비율 |
| `admin_list_admins` | `()` | `(user_id uuid, email text, granted_at timestamptz)` | admin_users ⨝ auth.users. **관리자(소수 신뢰집합) 이메일만** 노출 |
| `admin_grant_by_email` | `(p_email text, p_granted_by uuid)` | `(user_id uuid, email text)` | email→id 해석 후 upsert. 미존재 시 예외 |
| `admin_revoke` | `(p_user_id uuid)` | `void`/영향행 | admin_users 삭제 |

기존 `admin_okr_stats`/`admin_category_stats`/`admin_tag_stats`는 유지·재사용.

**성능 각주(ponytail)**: `admin_growth_series` 버킷별 상관 서브쿼리 = 저트래픽·소버킷(≤30)에서 허용. 테이블 성장 시 `bookmarks.created_at`/`auth.users.created_at` btree 인덱스 + 사전 group-by 조인으로 대체.

---

## 5. API 계층

**`GET /api/admin/stats?range=`** (기존 확장, `withAdmin` 유지, Zod 검증):
- 기본: `{ range, okr, categories, growth[], trending[], health }`
- `?category=` 지정 시(드릴다운): 기존대로 `{ range, category, tags }`
- 실패 시 기존 graceful-degradation 패턴 유지

**`/api/admin/admins`** (신규, `withAdmin`, Zod):
- `GET` → `{ admins: [{ userId, email, grantedAt }] }`
- `POST` `{ email }` → 승격. `p_granted_by = ctx.user.id`. 성공 `{ admin }`, 미존재 유저 404/422
- `DELETE ?userId=` → 강등. 본인 강등 방지(최소 관리자 1명 보장)

전 엔드포인트 `createAdminClient()`(service_role)로 RPC 호출 — `isAdmin`(세션 클라이언트)과 분리 유지.

---

## 6. 컴포넌트 구조

```
front/components/admin/
  AdminDashboard.tsx      (오케스트레이터: stats+usage+admins 병렬 fetch, range/category URL 상태)
  OkrTiles.tsx            (유지)
  GrowthChart.tsx         (신규, recharts AreaChart — signups/saves 2 series)
  BarList.tsx             (신규 공유: 랭킹 가로막대. CSS width. 클릭 콜백 옵션)
  CategoryBar.tsx         (신규: BarList 래핑, 카테고리 분포, 클릭→드릴다운)
  TrendingTags.tsx        (신규: 태그 + delta 뱃지)
  HealthStats.tsx         (신규: 데드링크·미분류 비율 2지표)
  OpenAiUsage.tsx         (유지)
  AdminManager.tsx        (신규: 관리자 목록 + 승격 폼 + 강등)
  CategoryDrilldownModal.tsx  (유지, DonutChart→BarList 교체)
  DonutChart.tsx          (은퇴 — 삭제)
```

`BarList`가 분포·드릴다운 공용. 라벨 + 건수 + 비율(괄호 보조) 표기 통일(기존 건수 통일 규칙 계승).

---

## 7. 보안 불변 (변경 없음)

- `withAdmin` 게이팅(미인증 401, 비관리자 404 은닉)
- 모든 입력 Zod `safeParse`
- `embedding`/`content`/개별 유저 북마크 미노출
- 신규 RPC `service_role` 전용 grant + PUBLIC/anon/authenticated revoke
- 관리자 이메일은 승격 대상 지정 목적의 최소 노출(관리자 = 소수 신뢰집합), 일반 유저 PII 아님
- 본인 강등 방지(잠금아웃 회피)

---

## 8. 테스트

- RPC: 각 함수 버킷 경계·빈 데이터·delta 계산 검증(순수 집계)
- Route: `admins` grant/revoke happy+실패(미존재 email, 본인 강등), stats 확장 payload
- 컴포넌트: GrowthChart/BarList/TrendingTags/HealthStats/AdminManager 렌더 + 상호작용, 드릴다운 BarList 교체 회귀
- 기존 admin 테스트 payload 확장에 맞춰 갱신

---

## 9. 마이그레이션

- `0028_admin_v2_stats_functions.sql` — growth/trending/health RPC
- `0029_admin_management_functions.sql` — list/grant/revoke RPC
- `docs/specs/database.md` §관리자 대시보드 집계에 신규 RPC 시그니처 추가
