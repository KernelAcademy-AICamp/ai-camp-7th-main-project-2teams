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
    })
  })

  it('부분 일치 → 교집합 기반', () => {
    const s = scoreTags(['개발', '프론트엔드', '오답'], ['개발', '프론트엔드'])
    expect(s.precision).toBeCloseTo(2 / 3)
    expect(s.recall).toBe(1)
    expect(s.exact).toBe(false)
  })

  it('둘 다 빈 태그(로그인 페이지) → 완벽', () => {
    expect(scoreTags([], [])).toMatchObject({ precision: 1, recall: 1, f1: 1, exact: true })
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
  })
})

// 실 OpenAI 골든셋 평가 — 비용·flaky 때문에 RUN_TAG_EVAL=1에서만.
// 실행: RUN_TAG_EVAL=1 npx vitest run lib/__tests__/tag-eval.test.ts
// 회귀 게이트: macro-F1 baseline 미만이면 실패.
// held-out 실측: n=69, 대분류 12종(라이프스타일·여행·금융 신설 포함). macro-F1 ≈ 0.79 (2026-06). 레버리지 1/69≈0.014.
// 라이프스타일·여행·금융은 현 DB 표본 부족으로 합성 케이스 — 실데이터 유입 시 교체 권장.
// 남은 모호: ev 충전소(여행 오판), 브랜드 디자인스튜디오 마케팅/기업 → 팀 검수 후 상향.
const F1_BASELINE = 0.78

describe.runIf(process.env.RUN_TAG_EVAL === '1')('골든셋 평가 (실 OpenAI)', () => {
  it(
    `macro-F1 >= ${F1_BASELINE}`,
    async () => {
      // 목 모드면 generateTags가 고정값 반환 → 평가 무의미. 동시 설정 실수 차단.
      expect(process.env.E2E_MOCK_OPENAI, 'RUN_TAG_EVAL과 E2E_MOCK_OPENAI 동시 설정 불가').not.toBe('1')

      const golden: { url: string; title: string; description: string; gold: string[] }[] =
        JSON.parse(readFileSync(join(__dirname, '../../eval/tag-golden.json'), 'utf-8'))

      const scores: TagScore[] = []
      for (const item of golden) {
        const predicted = await generateTags({
          title: item.title,
          url: item.url,
          description: item.description,
        })
        const s = scoreTags(predicted, item.gold)
        scores.push(s)
        // 항목별 결과 출력 — 어떤 URL이 틀렸는지 확인용
        console.log(
          `F1=${s.f1.toFixed(2)} exact=${s.exact} | pred=[${predicted}] gold=[${item.gold}] | ${item.url}`,
        )
      }

      const agg = aggregate(scores)
      console.log('\n=== 집계 ===', JSON.stringify(agg, null, 2))
      expect(agg.f1).toBeGreaterThanOrEqual(F1_BASELINE)
    },
    120_000,
  )
})
