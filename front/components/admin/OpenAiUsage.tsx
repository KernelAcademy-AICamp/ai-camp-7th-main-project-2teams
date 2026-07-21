export type Usage = {
  available: boolean
  totalCostUsd: number
  totalTokens: number
  byModel: Array<{ model: string; costUsd: number }>
}

const ASSUMED_COST_PER_USER = 0.02 // business-viability.md §2.1 가정선

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
  const perUser = activeUsers > 0 ? totalCostUsd / activeUsers : 0
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
      <div className="mt-2 text-sm tabular-nums text-text-secondary">
        유저당 <span>${perUser.toFixed(4)}</span>
        <span className={`ml-2 text-xs ${labelColor}`}>
          (가정선 ${ASSUMED_COST_PER_USER.toFixed(2)}
          {overBudget ? ' 초과' : ' 이내'})
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(budgetPct, 100)}%` }} />
      </div>
    </div>
  )
}
