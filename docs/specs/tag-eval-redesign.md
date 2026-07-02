# 태그 검증 프로세스 재정의 시나리오

> 작성 배경: 2026-07-02 전체 재태깅(retag) 결과 미분류 119→371개(29%) 증가. 원인 분석 → 검증 프로세스 재설계.
> 관련: `front/lib/ai.ts`, `front/lib/tag-eval.ts`, `front/eval/tag-golden.json`, `front/scripts/retag.ts`, `docs/specs/tag-taxonomy.md`

## 0. 원인 판정 (2026-07-02 ablation 실측)

`front/eval/tag-golden.json` (description 112/115 채워짐, gold보유 100건)을 두 조건으로 평가:

| 조건 | F1 | 미분류율 | 대분류정확도 |
|---|---|---|---|
| A: title+url+**description** | 0.85 | 0/100 (0%) | 0.94 |
| B: title+url만 **(retag 조건)** | 0.79 | 2/100 (2%) | 0.90 |
| **Δ(A→B)** | **-0.06** | **+2%p** | -0.04 |

**판정: description 부재는 주원인 아님.** description 제거해도 골든셋 미분류는 2%뿐인데, 실제 retag 미분류는 29%(371/1286) — **15배 괴리**.

이 괴리 = 진짜 원인:
1. **저품질 title** — 실제 미분류 대다수가 브랜드명 단독(pxd·Barkas), URL 통짜 title(`https://dribbble.com/`), 로그인/대시보드(ChatGPT·GitHub dashboard), 한국 서비스(무신사·사람인, LLM 지식 약함). title 자체가 빈약해 description 있어도 못 살림.
2. **골든셋 비대표성** — 골든셋 115건은 깨끗한 제목뿐. 위 저품질 패턴 미포함 → **F1 0.85가 실제 성능을 과대평가**.
3. **content 없는 경로 공통 문제** — retag(`scripts/retag.ts:68`)와 import(`app/api/bookmarks/import/route.ts:85`) 모두 title+url만. 저장(확장, content 포함)만 본문 덕에 취약점이 가려져 왔음. **retag 특정 문제 아님.**

→ 우선순위 재조정: 입력 보강(§A-2, description)은 효과 제한적(미분류 -2%p). **골든셋 대표성(§C-1)과 title 정제/폴백이 미분류 감축의 실질 지렛대.**

## 1. 문제 정의

### 1.1 입력 정합성 붕괴

태깅이 3경로에서 서로 다른 입력으로 실행됨:

| 경로 | 입력 | 코드 |
|---|---|---|
| 저장(확장) | title + url + **content(본문)** | `app/api/bookmarks/route.ts:61` |
| 골든셋 평가 | title + url + **description** | `lib/__tests__/tag-eval.test.ts:84` |
| **재태깅(retag)** | title + url **만** | `front/scripts/retag.ts:68` |

→ **골든셋 F1 0.85는 description을 준 조건의 수치.** retag는 그보다 열악한 입력이라 실제 품질이 평가치보다 낮음. **평가가 성능을 과대평가**하는 구조.

### 1.2 저품질 title + 골든셋 대표성 부족 (주원인, §0 판정)

실제 미분류 유발 패턴이 골든셋(n=115)에 반영 안 됨. title 자체가 빈약한 케이스:

- 브랜드/스튜디오 회사명 단독 title ("pxd", "Barkas", "CFC")
- title = URL 통짜 (`https://dribbble.com/` — 제목 추출 실패 북마크)
- 한국 유명 서비스 (무신사·사람인·G마켓·브런치 — LLM 한국 도메인 지식 약함)
- 로그인/대시보드/앱 URL (ChatGPT·GitHub dashboard·애널리틱스)

→ 골든셋이 이 패턴을 대표 못 해 F1 0.85가 실제(미분류 29%)를 과대평가. §0 참조.

### 1.3 회귀 게이트 지표 부족

`tag-eval.test.ts`는 macro-F1만 게이트. **미분류율(empty rate)** 지표 없음 → 대량 태그 삭제가 F1에 안 잡히고 통과 가능.

## 2. 재정의 시나리오

### 시나리오 A — 입력 정합성 확보 (우선순위 1)

**A-1. 평가를 retag와 동일 입력으로 정렬**
- 골든셋 평가를 두 모드로 분리 실행:
  - `full` 모드: title+url+description (저장 시 품질 상한 측정)
  - `retag` 모드: title+url만 (실제 재태깅 품질 측정)
- 두 F1 격차 = "content 의존도" 지표. 격차 크면 재태깅이 위험함을 정량 경고.

**A-2. retag 입력 보강 (택1)**
- (a) DB에 `description`(메타 요약) 컬럼 확보 — content 아님, og:description 등 비민감 메타만. 보안 규칙(content 저장 금지) 위반 아님.
- (b) retag 시 URL 메타 재크롤링해 description 확보 후 태깅.
- (c) 보강 불가 시: **retag는 "개선"이 아니라 "열화 가능" 작업으로 규정** → 빈 태그 전환은 기본 스킵(아래 B-2).

### 시나리오 B — retag 안전장치 (우선순위 1)

**B-1. 백업 필수화** ✅ 구현 (파일 스냅샷 방식)
- retag 비-DRY 실행 시 쓰기 전 전체 `(id, tags)` 스냅샷을 `scripts/backups/retag-tags-<ts>.json`에 자동 저장. 백업 실패면 재태깅 중단. 복원: `RESTORE=<file> npx tsx scripts/retag.ts`.
- DB 테이블(`bookmarks_tags_backup_YYYYMMDD`) 대신 로컬 파일 채택 — 프로젝트에 pg 연결·DDL RPC 경로 없음(supabase-js는 DDL 불가), 새 의존성 회피. 파일은 user 데이터라 `.gitignore`.
- 상위 경로(선택): B-3 사후검증 SQL join을 쓰려면 DB 백업 테이블 필요 → 마이그레이션으로 백업 함수/테이블 추가 시 전환.

**B-2. 빈 태그 전환 스킵 옵션**
- `KEEP_NONEMPTY=1`: 새 태그가 `[]`인데 기존 태그가 있으면 업데이트 스킵(기존 유지). 순손실 방지.
- 기본값 논의 필요: content 없는 retag에선 `KEEP_NONEMPTY=1`을 기본으로 권장.

**B-3. 사후 검증 쿼리 표준화**
```sql
SELECT
  (SELECT count(*) FROM bookmarks WHERE tags='{}') AS empty_now,
  (SELECT count(*) FROM <backup> WHERE tags='{}') AS empty_before,
  (SELECT count(*) FROM bookmarks b JOIN <backup> k ON b.id=k.id
     WHERE b.tags IS DISTINCT FROM k.tags) AS changed;
```
- 미분류 증가율 임계 초과(예: +10%p) 시 롤백 검토.

### 시나리오 C — 골든셋 확장 (우선순위 2)

**C-1. 미분류 유발 패턴 골든셋 편입**
현재 미분류 371건에서 유형별 대표 샘플을 골든셋에 추가하고 정답(gold) 정의:

| 패턴 | 추가 샘플 | 정답 방향 |
|---|---|---|
| 브랜드/스튜디오 회사명 단독 | pxd, PORTO ROCHA, HuskyFox | 브랜드>기업 또는 디자인 (판단 기준 명문화) |
| title=URL 통짜 | dribbble.com, behance.net | 도메인 기반 분류 허용 |
| 한국 커머스 | 무신사, G마켓 | 쇼핑>패션 등 |
| 한국 커리어 | 사람인, LinkedIn | 비즈니스>커리어 |
| 공공데이터/통계 | 공공데이터포털, KOSIS | 대분류 정의 필요(현재 미커버) |
| AI 서비스 툴 | Hugging Face, Suno, ElevenLabs | AI/ML (툴이어도 분류할지 정책 결정) |
| 로그인/대시보드 | ChatGPT, GitHub dashboard | **0태그 유지 vs 서비스 분류** 정책 결정 |

**C-2. 정책 결정 (2026-07-02 확정)**
1. LLM 챗 툴(ChatGPT·Claude·Gemini) → **AI/ML>LLM.** 도메인이 명백한 AI 툴이면 로그인/앱 페이지여도 분류(미분류 감축). 단 정체불명 툴·대시보드는 기존대로 0태그.
2. 공공데이터/통계/행정(공공데이터포털·KOSIS) → **비즈니스>데이터.** 신설 대분류 없음(13개 유지, taxonomy 파급 회피).
3. 디자인 스튜디오 회사 페이지(pxd 등) → **디자인>스튜디오.** 목적(디자인 영감/레퍼런스) 우선. 브랜드는 소비재 브랜드(Nike 등)에 한정.

### 시나리오 D — 회귀 게이트 강화 (우선순위 2) ✅ 구현

**D-1. 미분류율 지표 추가** ✅
- `tag-eval.ts` `aggregate()`에 `emptyRate`(gold 있는데 예측 빈 비율) 추가. `TagScore`에 `miss`/`goldNonEmpty` 필드.
- 분모 = gold 있는 항목만(빈 gold=로그인 정답은 제외). 단위 테스트 포함.

**D-2. 대분류 정확도 + 미분류 동시 감시** ✅
- F1만으로는 "태그 삭제로 오답 회피"가 통과됨. `EMPTY_RATE_MAX=0.15` 게이트를 rich·title-only 두 패스에 병행 적용해 차단.

## 3. 실행 순서 (권장 — §0 판정 반영)

1. **B-2** ✅ `KEEP_NONEMPTY` (bad0b81). B-1(백업 필수화) 미완.
2. **C-1, C-2** — 골든셋에 저품질 title 패턴 편입 + 정책 결정. **미분류 감축 실질 지렛대(주원인 대응).** ⚠️ §4 팀 정책 선결.
3. **A-1** ✅ 평가 이중 모드(rich/title-only). A53·PR #156. 실측 skew F1 −0.039.
4. **D-1, D-2** ✅ 게이트 강화(F1+`emptyRate`). 회귀 자동 차단.
5. **A-2** — 입력 보강(description). import 경로 ✅ A52·PR #155. retag 경로 미완. **효과 제한적(미분류 -2%p, §0).**

### 남은 작업
- **C-1/C-2** (골든셋 저품질 title 편입) — §4 정책 합의 후. 미분류 감축 주 지렛대.
- **B-1** (retag 백업 자동화) — 소규모 안전장치.
- **A-2 retag** (retag 재크롤링 description) — 효과 제한적, 후순위.

> §0 판정: description 부재는 부차 원인. retag만의 문제 아님(import 공통). 주원인은 저품질 title + 골든셋 비대표성.

## 4. 미결 정책 (팀 합의 필요)

- [x] LLM 챗 툴 분류 여부 (§C-2.1) → **AI/ML>LLM** (2026-07-02)
- [x] 공공데이터/통계 대분류 신설 여부 (§C-2.2) → **비즈니스>데이터, 신설 안 함** (2026-07-02)
- [x] 디자인 스튜디오 브랜드/디자인 우선순위 (§C-2.3) → **디자인>스튜디오** (2026-07-02)
- [ ] retag `KEEP_NONEMPTY` 기본값 (§B-2)
- [ ] retag 입력 보강 방식 a/b/c (§A-2)
