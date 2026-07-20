export const ADMIN_RANGES = ['1d', '7d', '30d'] as const
export type AdminRange = (typeof ADMIN_RANGES)[number]

const INTERVALS: Record<AdminRange, string> = {
  '1d': '1 day',
  '7d': '7 days',
  '30d': '30 days',
}

export const RANGE_DAYS: Record<AdminRange, number> = {
  '1d': 1,
  '7d': 7,
  '30d': 30,
}

export function isAdminRange(v: string): v is AdminRange {
  return (ADMIN_RANGES as readonly string[]).includes(v)
}

export function parseRange(v: string | null): AdminRange {
  return v && isAdminRange(v) ? v : '7d'
}

export function rangeToInterval(r: AdminRange): string {
  return INTERVALS[r]
}
