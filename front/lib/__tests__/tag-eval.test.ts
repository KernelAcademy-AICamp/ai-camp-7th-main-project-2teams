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
    })
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
})

// 실 OpenAI 골든셋 평가 — 비용·flaky 때문에 RUN_TAG_EVAL=1에서만.
// 실행: RUN_TAG_EVAL=1 npx vitest run lib/__tests__/tag-eval.test.ts
// 회귀 게이트: macro-F1 baseline 미만이면 실패.
// 골든셋: n=115, 대분류 13종(콘텐츠 신설 포함). 레버리지 1/115≈0.009.
// 실측(2026-07): macro-F1 0.85, precision 0.86, recall 0.87, 대분류 정확도 0.93, exact 0.63.
// baseline 0.82 = 실측 0.85 대비 ~0.03 여유(~3항목 오탐 허용). 실회귀는 잡고 노이즈는 통과.
// 콘텐츠(3)·여행(4)은 표본 얇음 — 실데이터 유입 시 확충 권장.
// 남은 모호: ev 충전소(여행 오판), 브랜드 디자인스튜디오 마케팅/기업 → 팀 검수 후 상향.
const F1_BASELINE = 0.82

// A53: 입력 조건별 평가.
// - rich: description 포함 — 단건 추가·A52 임포트(fetchMeta 성공) 경로. 회귀 게이트 대상.
// - title-only: description 제거 — 임포트에서 메타 조회 실패·본문 부재 시의 하한(floor).
//   프로덕션 실패 모드를 eval이 보게 하는 것이 목적. rich 대비 하락폭 = train/serve skew 크기.
// 실측(2026-07, gpt-4o-mini, n=115):
//   rich       F1 0.838 · 대분류 0.922 · exact 0.635
//   title-only F1 0.799 · 대분류 0.896 · exact 0.617  → skew F1 −0.039(A52가 회복하는 몫)
//   주의: 골든셋 title이 실 임포트보다 깔끔해 이 skew는 프로덕션 실 skew의 하한. 지저분 title 표본
//        확충 시 격차 커질 것(A53 후속).
const TITLE_ONLY_F1_BASELINE = 0.77 // 실측 0.799 − ~0.03 여유(rich 0.838→0.82와 동일 마진)
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
    },
    300_000, // 골든셋 115건 순차 OpenAI 호출 — 항목당 ~1.5s
  )

  it(
    `title-only(description 제거) macro-F1 >= ${TITLE_ONLY_F1_BASELINE}`,
    async () => {
      expect(process.env.E2E_MOCK_OPENAI, 'RUN_TAG_EVAL과 E2E_MOCK_OPENAI 동시 설정 불가').not.toBe('1')

      const agg = aggregate(await runGolden(loadGolden(), false))
      console.log('\n=== 집계 [title-only] ===', JSON.stringify(agg, null, 2))
      // 임포트 굶김 경로 회귀 게이트 — 이 값이 떨어지면 임포트 태깅 품질 저하.
      expect(agg.f1).toBeGreaterThanOrEqual(TITLE_ONLY_F1_BASELINE)
    },
    300_000,
  )
})
