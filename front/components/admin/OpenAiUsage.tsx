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
      <div className="rounded-lg border p-4">
        <div className="text-sm text-muted-foreground">OpenAI 사용량</div>
        <div className="mt-1 text-sm">사용량 조회 불가</div>
        <div className="mt-1 text-xs text-muted-foreground">
          OPENAI_ADMIN_KEY 미설정 또는 API 응답 오류
        </div>
      </div>
    )
  }

  const perUser = activeUsers > 0 ? usage.totalCostUsd / activeUsers : 0

  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-muted-foreground">OpenAI 사용량</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        ${usage.totalCostUsd.toFixed(2)}
      </div>
      <div className="mt-2 text-sm tabular-nums">
        유저당 <span>${perUser.toFixed(4)}</span>
        <span className="ml-2 text-xs text-muted-foreground">
          (가정선 ${ASSUMED_COST_PER_USER.toFixed(2)}
          {perUser > ASSUMED_COST_PER_USER ? ' 초과' : ' 이내'})
        </span>
      </div>
    </div>
  )
}
