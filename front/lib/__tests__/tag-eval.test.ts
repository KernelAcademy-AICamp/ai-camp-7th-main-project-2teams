import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scoreTags, aggregate, type TagScore } from '../tag-eval'
import { generateTags } from '../ai'

// 지표 함수 단위 테스트 — 항상 실행 (OpenAI 미호출).
describe('scoreTags', () => {
  it('완전 일치 → precision=recall=f1=1, exact', () => {
    expect(scoreTags(['개발', 'React'], ['개발', 'React'])).toEqual({
      precision: 1,
      recall: 1,
      f1: 1,
      exact: true,
      categoryHit: true,
      goldNonEmpty: true,
      miss: false,
    })
  })

  it('D-1: gold 있는데 예측 빈 태그 → miss=true (미분류 실패)', () => {
    const s = scoreTags([], ['개발', 'React'])
    expect(s.goldNonEmpty).toBe(true)
    expect(s.miss).toBe(true)
  })

  it('D-1: gold 빈 태그(로그인) + 예측 빈 태그 → miss=false (정답, 분모 제외)', () => {
    const s = scoreTags([], [])
    expect(s.goldNonEmpty).toBe(false)
    expect(s.miss).toBe(false)
  })

  it('D-1: gold 있고 예측도 있으면 → miss=false', () => {
    expect(scoreTags(['디자인'], ['개발']).miss).toBe(false)
  })

  it('대분류 다르면 categoryHit=false', () => {
    expect(scoreTags(['디자인'], ['개발']).categoryHit).toBe(false)
    // 부분 태그 일치해도 대분류 틀리면 categoryHit=false
    expect(scoreTags(['디자인', 'React'], ['개발', 'React']).categoryHit).toBe(false)
  })

  it('둘 다 미분류(빈 태그) → categoryHit=true', () => {
    expect(scoreTags([], []).categoryHit).toBe(true)
    expect(scoreTags([], ['개발']).categoryHit).toBe(false)
  })

  it('부분 일치 → 교집합 기반', () => {
    const s = scoreTags(['개발', '프론트엔드', '오답'], ['개발', '프론트엔드'])
    expect(s.precision).toBeCloseTo(2 / 3)
    expect(s.recall).toBe(1)
    expect(s.exact).toBe(false)
  })

  it('둘 다 빈 태그(로그인 페이지) → 완벽', () => {
    expect(scoreTags([], [])).toMatchObject({ precision: 1, recall: 1, f1: 1, exact: true, categoryHit: true })
  })

  it('예측만 빈 태그 → recall=0', () => {
    expect(scoreTags([], ['개발'])).toMatchObject({ precision: 0, recall: 0, exact: false })
  })

  it('정규화 적용 — alias도 일치 처리', () => {
    expect(scoreTags(['dev', 'FE'], ['개발', '프론트엔드']).exact).toBe(true)
  })
})

describe('aggregate', () => {
  it('macro 평균 + exact 비율', () => {
    const a = aggregate([scoreTags(['a'], ['a']), scoreTags(['b'], ['c'])])
    expect(a.n).toBe(2)
    expect(a.exactMatchRate).toBe(0.5)
    expect(a.precision).toBe(0.5)
    expect(a.recall).toBe(0.5)
    expect(a.f1).toBe(0.5)
    expect(a.categoryAccuracy).toBe(0.5)
  })

  it('D-1: emptyRate = gold 있는 항목 중 예측 빈 비율', () => {
    // gold 있는 3건 중 1건만 예측 빈 태그 → 1/3
    const a = aggregate([
      scoreTags([], ['개발']), // miss
      scoreTags(['개발'], ['개발']), // hit
      scoreTags(['디자인'], ['디자인']), // hit
    ])
    expect(a.emptyRate).toBeCloseTo(1 / 3)
  })

  it('D-1: gold 빈 항목은 emptyRate 분모에서 제외', () => {
    // gold 있는 1건(miss) + gold 빈 1건(정답) → 분모 1, 분자 1 = 1.0
    const a = aggregate([scoreTags([], ['개발']), scoreTags([], [])])
    expect(a.emptyRate).toBe(1)
  })

  it('D-1: gold 있는 항목 없으면 emptyRate=0 (0 나눗셈 방지)', () => {
    const a = aggregate([scoreTags([], []), scoreTags(['개발'], [])])
    expect(a.emptyRate).toBe(0)
  })
})

// 실 OpenAI 골든셋 평가 — 비용·flaky 때문에 RUN_TAG_EVAL=1에서만.
// 실행: RUN_TAG_EVAL=1 npx vitest run lib/__tests__/tag-eval.test.ts
// 회귀 게이트: macro-F1 baseline 미만이면 실패.
// 골든셋: n=213 (C-1: 저품질 title/브랜드단독/URL통짜/로그인·앱 패턴 편입 후, 기존 n=115 대비 +98).
// 실측(2026-07-23, 5efb294=PR #279 형식축 enum 재설계 후, RUN_TAG_EVAL=1 rich 전량): macro-F1 0.764,
// precision 0.761, recall 0.784, 대분류 정확도 0.840, exact 0.460, emptyRate 0.035.
// (재설계 전 2026-07-15 5dfccf3=0.787 → 중분류 2축 enum화로 골든셋 라벨 일관성이 강해지며 채점이 엄격해져 0.764로 하락. 품질 회귀 아님.)
// 실측(2026-07-24, AI/ML↔개발 경계 규칙 도입 후 rich 전량): macro-F1 0.768, 대분류 정확도 0.859, emptyRate 0.030.
// AI 코딩툴(하네스·코덱스 강의)·ML 라이브러리(OpenCV·pandas)를 개발로 흡수하던 최대 오분류 버킷 교정 → 대분류 +0.019.
// n=115 시절 baseline 0.82보다 낮아진 건 회귀가 아니라 §0 판정대로 골든셋이 저품질 title을 더 대표하게 되며
// 과대평가가 빠진 것.
//
// baseline 0.76→0.74 하향(2026-07-25). 이유 — 쉽게 말하면:
// LLM은 같은 입력을 줘도 실행할 때마다 답이 조금씩 달라진다. 그래서 코드·프롬프트·골든셋을
// 하나도 안 바꾸고 3번 돌렸는데 F1이 0.768 → 0.755 → 0.7595로 출렁였다(폭 ±0.013).
// 기존 게이트 0.76은 이 출렁임 밴드(0.755~0.768) 한복판이라, 품질이 그대로여도
// 실행할 때마다 절반 확률로 실패하는 "동전던지기 게이트"였다(실측 마진 +0.008 — 다른 게이트
// 관례 ~0.03보다 과도하게 타이트). 게이트는 출렁임 밑에 둬야 진짜 하락만 잡는다:
// 0.74 = 관측 최솟값 0.755 − 분산 여유 0.015. 역사상 진짜 회귀는 −0.02 이상 폭으로
// 나타났으므로(형식축 재설계 때 0.787→0.764) 0.74면 회귀는 잡고 분산 오탐은 사라진다.
// 실측(2026-07-25, 강의/학습 주제 우선 정책 + 골든셋 12건 재라벨 후 rich): macro-F1 0.782,
// precision 0.777, recall 0.804, 대분류 0.878, exact 0.474, emptyRate 0.035 — 분산 밴드 상단 돌파.
const F1_BASELINE = 0.74

// A53: 입력 조건별 평가.
// - rich: description 포함 — 단건 추가·A52 임포트(fetchMeta 성공) 경로. 회귀 게이트 대상.
// - title-only: description 제거 — 임포트에서 메타 조회 실패·본문 부재 시의 하한(floor).
//   프로덕션 실패 모드를 eval이 보게 하는 것이 목적. rich 대비 하락폭 = train/serve skew 크기.
// 실측(2026-07-25 동일 run, gpt-4o-mini, n=213, v2 재설계+경계규칙 반영 코드):
//   rich       F1 0.755 · 대분류 0.845 · exact 0.446 · emptyRate 0.030
//   title-only F1 0.748 · 대분류 0.831 · exact 0.474 · emptyRate 0.066
//   → train/serve skew = rich−title +0.007 (동일 코드 버전 비교, 사실상 무시 가능 — 안정).
//   (07-13 구버전 실측 F1 0.764는 재설계 前 값이라 폐기. 07-25 재측정으로 baseline 0.73의
//    근거가 현행 코드 실측 0.748(마진 +0.018)로 갱신됨.)
//   n=115 대비 두 모드 다 하락 — 브랜드단독/URL통짜/로그인·앱 표본 추가로 골든셋 대표성이
//   실제 분포에 가까워진 결과(§0). 진짜 회귀 여부는 이 n=213 baseline 기준으로 판단할 것.
const TITLE_ONLY_F1_BASELINE = 0.73 // 실측 0.748 − ~0.02 여유(분산 고려, F1_BASELINE 하향 논리와 동일)

// D-2: 미분류율 상한. F1만으론 "태그 삭제로 오답 회피"가 통과됨(retag 미분류 29% 사례).
// emptyRate 병행 게이트로 대량 태그 삭제 회귀 차단. n=213 실측 emptyRate는 rich 3.0%·title-only 6.6%로
// 0.15 밑 — 여전히 느슨한 가드레일(큰 열화만 잡음), 프롬프트 회귀로 급증 시 실패.
const EMPTY_RATE_MAX = 0.15
type GoldenItem = { url: string; title: string; description: string; gold: string[] }

function loadGolden(): GoldenItem[] {
  return JSON.parse(readFileSync(join(__dirname, '../../eval/tag-golden.json'), 'utf-8'))
}

// 골든셋 전체를 지정 입력 조건으로 채점. includeDescription=false면 임포트 굶김 재현.
async function runGolden(
  golden: GoldenItem[],
  includeDescription: boolean,
): Promise<TagScore[]> {
  const scores: TagScore[] = []
  for (const item of golden) {
    const predicted = await generateTags({
      title: item.title,
      url: item.url,
      description: includeDescription ? item.description : undefined,
    })
    const s = scoreTags(predicted, item.gold)
    scores.push(s)
    // 항목별 결과 출력 — 어떤 URL이 틀렸는지 확인용
    console.log(
      `[${includeDescription ? 'rich' : 'title'}] F1=${s.f1.toFixed(2)} exact=${s.exact} | pred=[${predicted}] gold=[${item.gold}] | ${item.url}`,
    )
  }
  return scores
}

describe.runIf(process.env.RUN_TAG_EVAL === '1')('골든셋 평가 (실 OpenAI)', () => {
  it(
    `rich(description 포함) macro-F1 >= ${F1_BASELINE}`,
    async () => {
      // 목 모드면 generateTags가 고정값 반환 → 평가 무의미. 동시 설정 실수 차단.
      expect(process.env.E2E_MOCK_OPENAI, 'RUN_TAG_EVAL과 E2E_MOCK_OPENAI 동시 설정 불가').not.toBe('1')

      const agg = aggregate(await runGolden(loadGolden(), true))
      console.log('\n=== 집계 [rich] ===', JSON.stringify(agg, null, 2))
      expect(agg.f1).toBeGreaterThanOrEqual(F1_BASELINE)
      expect(agg.emptyRate).toBeLessThanOrEqual(EMPTY_RATE_MAX) // D-2: 미분류 급증 차단
    },
    600_000, // 골든셋 213건 순차 OpenAI 호출 — 항목당 ~1.5s ≈ 320s, 여유 포함 10분
  )

  it(
    `title-only(description 제거) macro-F1 >= ${TITLE_ONLY_F1_BASELINE}`,
    async () => {
      expect(process.env.E2E_MOCK_OPENAI, 'RUN_TAG_EVAL과 E2E_MOCK_OPENAI 동시 설정 불가').not.toBe('1')

      const agg = aggregate(await runGolden(loadGolden(), false))
      console.log('\n=== 집계 [title-only] ===', JSON.stringify(agg, null, 2))
      // 임포트 굶김 경로 회귀 게이트 — 이 값이 떨어지면 임포트 태깅 품질 저하.
      expect(agg.f1).toBeGreaterThanOrEqual(TITLE_ONLY_F1_BASELINE)
      expect(agg.emptyRate).toBeLessThanOrEqual(EMPTY_RATE_MAX) // D-2: retag 입력 조건 미분류 급증 차단
    },
    600_000, // rich 패스와 동일 — 213건 순차 호출
  )
})
