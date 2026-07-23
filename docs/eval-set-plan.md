# Eval Set 기획 문서 — 북마크 AI

> AI 기능(자동 태깅·자연어 검색)의 출시 가능 여부를 숫자로 판정하는 평가셋 정의.
> "평가셋이 있다"의 4대 구성요소(핵심 use case · Edge case · 통과 기준 · 실패 유형 분류)를 모두 충족한다.
> 실측 기준일: 태깅 2026-07-13 (gpt-4o-mini) · 검색 2026-07-23 라이브 재검증 (text-embedding-3-large).

---

## 0. 왜 평가셋인가

AI 출력은 배포 후 "느낌"으로 판단할 수 없다. 프롬프트 한 줄, 모델 버전 하나 바뀌면
품질이 소리 없이 무너진다. 평가셋은 **회귀 게이트** — CI에서 baseline 미달 시 머지 차단.

- 태깅: `RUN_TAG_EVAL=1 npx vitest run lib/__tests__/tag-eval.test.ts`
- 검색: `RUN_SEARCH_EVAL=1 npx vitest run lib/__tests__/search-eval.test.ts`

두 평가 모두 **골든셋(정답 데이터) + 지표 + baseline 상수**로 구성. 골든셋은
`front/eval/tag-golden.json`(213건), `front/eval/search-golden.json`(북마크 20·질의 14).

---

## 1. 자동 태깅 Eval

URL·제목·본문 → 대분류 1개 + 중·소분류 태그 배열 생성. 모델 gpt-4o-mini.

### ① 핵심 use case — 정상 시나리오 (실패 시 출시 불가)

| 시나리오 | 표본 | 판정 지표 |
|---|---|---|
| description 있는 북마크(단건 추가·임포트 성공) → 정확한 대분류+태그 | 199 / 213 | rich macro-F1 |
| 13개 고정 대분류로 올바르게 분류 | 전체 | 대분류 정확도 |

대분류 오분류는 UI 전체 필터를 망가뜨리므로 **가장 무거운 정상 케이스**.

### ② Edge case — 드물지만 실제 발생

| Edge case | 표본 | 왜 어려운가 |
|---|---|---|
| description 없음 (메타 조회 실패·본문 부재) | title-only 모드 전체 | 신호 부족 → train/serve skew 측정 |
| 로그인월 SPA (서버가 본문 도달 불가) | extension 6 · webapp 8 | 익스텐션은 로그인 세션으로 읽지만 서버는 못 읽음 → source regime 분리 |
| 브랜드 단독·URL 통짜 제목 | C-1 확장분 | 저품질 입력 대표성 확보 |
| 태깅 불가 (정답이 빈 배열) | 15 / 213 | "억지 태깅" 유도 방지 |

### ③ 통과 기준 + 실측

| 게이트 | 기준 | 실측 | 판정 |
|---|---|---|---|
| rich macro-F1 | ≥ 0.76 | **0.79** | ✅ |
| title-only macro-F1 (floor) | ≥ 0.73 | **0.76** | ✅ |
| emptyRate (미분류율 상한) | ≤ 0.15 | rich 0.05 · title 0.09 | ✅ |
| 대분류 정확도 (참고) | — | 0.864 | — |
| train/serve skew (rich−title F1) | 관찰용 | −0.027 | 안정 |

> F1만으로는 "태그를 지워 오답을 회피"하는 회귀가 통과된다(과거 retag 미분류 29% 사례).
> **emptyRate 병행 게이트**로 대량 태그 삭제 회귀를 차단.

### ④ 실패 유형 분류 (환각·누락·편향·형식)

| 유형 | 정의 | 포착 지표 | 실측 |
|---|---|---|---|
| **환각** | 근거 없는 태그 생성 | precision 하락 | 0.788 |
| **누락** | 있어야 할 태그 미생성 | recall · emptyRate | 0.811 / 0.05 |
| **편향** | 특정 대분류 쏠림·과소 | 대분류 정확도 | 0.864 |
| **형식** | 표기 분열(파이썬↔Python) | exact-match · alias 정규화 | 0.587 |

형식 오류는 `lib/tag-alias.ts` 정규화 사전으로 흡수 — 예: `파이썬→Python`, `클로드→Claude`,
`Tailwind CSS→Tailwind`. predicted·gold 양쪽 동일 정규화라 방향성 편향 없음.

---

## 2. 자연어 검색 Eval

자연어 질의 → pgvector 하이브리드 검색(교차언어 확장 + `match_bookmarks` RPC) → 상위 북마크.
모델 text-embedding-3-large (2026-07-22 3-small에서 전환, `dimensions:1536` 스키마 불변).
골든셋 북마크 삽입 후 질의 26건 채점, finally에서 정리.

### ① 핵심 use case

| 카테고리 | 질의 수 | 예시 |
|---|---|---|
| exact | 1 | 제목 그대로 검색 |
| synonym | 2 | 유의어 질의 → 동일 북마크 |
| cross-lingual | 5 | 한↔영 교차 (가장 흔한 실사용 패턴) |

### ② Edge case

| 카테고리 | 질의 수 | 왜 어려운가 |
|---|---|---|
| weak-vector | 3 | 고유명사 title-only 북마크 ↔ 기능형 질의 어휘갭 (예: "옵시디언" ↔ "글쓰기 노트 앱") |
| tag-only | 1 | 본문 없이 태그만으로 매칭 |
| noise | 2 | 무관 질의 → **결과 없음이 정답** (false positive 방지) |
| conversational | 8 | 시간참조·지시어·행위어 섞인 대화형 질의 (N-3, `stripConversationalNoise`로 해소) |
| particle | 4 | 조사 변형 질의 (N-4, 조사 제거 alias fallback으로 3/4 해소) |

### ③ 통과 기준 + 실측

| 게이트 | 기준 | 실측 | 판정 |
|---|---|---|---|
| overall recall | ≥ 0.85 | 0.923 (24/26, n=26) | ✅ |
| non-weak-vector recall (진짜 품질 게이트) | ≥ 0.90 | **0.957** (22/23, particle 1건 known miss) | ✅ |
| MRR / hitRate | 참고 | 0.923 (n=26) | — |

> weak-vector는 title-only 임베딩의 **구조적 한계**(회귀 아님) — baseline은 이 실패를
> 전제로 잡되, 그 외 카테고리 하락은 잡도록 non-weak 게이트를 별도 유지.
> baseline 이력: 0.83 → 0.75(N-2, weak-vector 표본 1→3 확대로 분모 증가) → 0.85(N-5, 3-large 전환).
> 2026-07-23 라이브 재검증: overall 0.923(24/26) 재현, miss 패턴 동일(weak-vector 1 + particle 1 known miss).

### ④ 실패 유형 분류

| 유형 | 정의 | 포착 지표 |
|---|---|---|
| **환각** | 무관 결과 반환 | noise 카테고리 (결과 있으면 오답) |
| **누락** | 관련 북마크 미노출 | recall · weak-vector miss |
| **편향** | 특정 카테고리만 잘 됨 | byCategory 분해 (카테고리별 recall) |
| **형식** | 순위 왜곡 | MRR (상위 노출 여부) |

---

## 3. 요약 — 출시 판정

| 평가 | 핵심 게이트 | 실측 | 상태 |
|---|---|---|---|
| 태깅 | macro-F1 ≥ 0.76 | 0.79 | 🟢 통과 |
| 태깅 | emptyRate ≤ 0.15 | 0.05 | 🟢 통과 |
| 검색 | non-weak recall ≥ 0.90 | 0.957 (22/23) | 🟢 통과 |
| 검색 | overall recall ≥ 0.85 | 0.923 (24/26) | 🟢 통과 |

**전 게이트 통과 — 출시 가능.** 알려진 약점(weak-vector title-only)은 게이트에
명시적으로 반영되어 회귀와 구분됨.

### 다음 확장 후보

- 태깅 소분류 정밀도(exact 0.587) — alias 사전 지속 보강
- 검색 weak-vector — 북마크 저장 시 본문 요약 임베딩 도입 시 해소 가능
