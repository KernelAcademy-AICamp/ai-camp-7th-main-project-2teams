export type Okr = {
  activeUsers: number
  firstSaveRate: number
  savesPerUser: number
  newSaves: number
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

export function OkrTiles({ okr }: { okr: Okr }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile label="활성 사용자" value={String(okr.activeUsers)} hint="저장 기준 대리지표" />
      <Tile label="첫 저장 완료율" value={`${Math.round(okr.firstSaveRate * 100)}%`} hint="목표 70%" />
      <Tile label="1인당 저장" value={okr.savesPerUser.toFixed(1)} hint="목표 20건/월" />
      <Tile label="신규 저장" value={String(okr.newSaves)} />
    </div>
  )
}
