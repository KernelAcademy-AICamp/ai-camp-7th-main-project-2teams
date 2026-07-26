export type Usage = {
  available: boolean
  totalCostUsd: number
  totalTokens: number
  byModel: Array<{ model: string; costUsd: number }>
  estimated: {
    productionCostUsd: number
    saves: number
    searches: number
    perUser: Array<{ user: string; costUsd: number }>
  } | null
}

const ASSUMED_COST_PER_USER = 0.02 // business-viability.md §2.1 가정선
// 도트 색 — NorthStarMetrics와 동일 규약(validate_palette 통과), 키 고정
const DOT_COLORS: Record<string, string> = { U1: '#4a90e2', U2: '#e8833a', 기타: '#9aa0a8' }

export function OpenAiUsage({ usage, activeUsers }: { usage: Usage; activeUsers: number }) {
  if (!usage.available) {
    return (
      <div className="h-full rounded-lg border border-line bg-surface-card p-4">
        <div className="text-sm text-text-secondary">OpenAI 사용량</div>
        <div className="mt-1 text-sm text-text-primary">사용량 조회 불가</div>
        <div className="mt-1 text-xs text-text-secondary">OPENAI_ADMIN_KEY 미설정 또는 API 응답 오류</div>
      </div>
    )
  }

  // API 응답이 malformed(number 아닌 값)여도 렌더가 죽지 않도록 방어
  const totalCostUsd = Number.isFinite(usage.totalCostUsd) ? usage.totalCostUsd : 0
  const est = usage.estimated
  // 가정선 비교는 실사용 추정 기준 — 청구 총액엔 개발·eval 비용이 섞여 유저당 원가를 왜곡한다.
  // 추정 불가(est null)면 기존처럼 청구 총액 기준으로 폴백.
  const prodCost = est ? est.productionCostUsd : totalCostUsd
  const perUser = activeUsers > 0 ? prodCost / activeUsers : 0
  const devCost = est ? Math.max(0, totalCostUsd - est.productionCostUsd) : null
  const overBudget = perUser > ASSUMED_COST_PER_USER
  // 가정선 대비 비율(막대 표시용) — 100% 초과 시 상한 클램프
  const budgetPct = Math.min((perUser / ASSUMED_COST_PER_USER) * 100, 150)
  const barColor = overBudget ? 'bg-warning' : 'bg-mint'
  const labelColor = overBudget ? 'text-warning' : 'text-mint'

  return (
    <div className="h-full rounded-lg border border-line bg-surface-card p-4">
      <div className="text-sm text-text-secondary">OpenAI 사용량</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">
        ${totalCostUsd.toFixed(2)}
      </div>
      {est && (
        <div className="mt-1 text-xs tabular-nums text-text-secondary">
          실사용 추정 ${est.productionCostUsd.toFixed(4)} (저장 {est.saves}·검색 {est.searches})
          {devCost !== null && ` · 개발·평가 $${devCost.toFixed(2)}`}
        </div>
      )}
      <div className="mt-2 text-sm tabular-nums text-text-secondary">
        유저당{est ? ' 실사용' : ''} <span>${perUser.toFixed(4)}</span>
        <span className={`ml-2 text-xs ${labelColor}`}>
          (가정선 ${ASSUMED_COST_PER_USER.toFixed(2)}
          {overBudget ? ' 초과' : ' 이내'})
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(budgetPct, 100)}%` }} />
      </div>
      {est && est.perUser.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {est.perUser.map((u) => (
            <li key={u.user} className="flex items-center gap-1.5 text-xs tabular-nums text-text-secondary">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full ring-2 ring-white"
                style={{ backgroundColor: DOT_COLORS[u.user] ?? '#9aa0a8' }}
              />
              {u.user} ${u.costUsd.toFixed(4)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
