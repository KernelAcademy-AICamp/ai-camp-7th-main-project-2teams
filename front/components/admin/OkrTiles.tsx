export type Okr = {
  activeUsers: number
  firstSaveRate: number
  savesPerUser: number
  newSaves: number
}

const ACCENTS = ['var(--sr-signal)', 'var(--sr-cyan)', 'var(--sr-violet)', 'var(--sr-amber)']

function Tile({
  label,
  value,
  hint,
  index,
}: {
  label: string
  value: string
  hint?: string
  index: number
}) {
  return (
    <div
      className="sr-tile"
      style={{ '--sr-tile-accent': ACCENTS[index % ACCENTS.length], animationDelay: `${index * 70}ms` } as React.CSSProperties}
    >
      <div className="sr-tile-label">{label}</div>
      <div className="sr-tile-value">{value}</div>
      {hint && <div className="sr-tile-hint">{hint}</div>}
    </div>
  )
}

export function OkrTiles({ okr }: { okr: Okr }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile index={0} label="활성 사용자" value={String(okr.activeUsers)} hint="저장 기준 대리지표" />
      <Tile index={1} label="첫 저장 완료율" value={`${Math.round(okr.firstSaveRate * 100)}%`} hint="목표 70%" />
      <Tile index={2} label="1인당 저장" value={okr.savesPerUser.toFixed(1)} hint="목표 20건/월" />
      <Tile index={3} label="신규 저장" value={String(okr.newSaves)} />
    </div>
  )
}
