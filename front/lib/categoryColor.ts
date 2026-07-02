// 카테고리 컬러코딩 (Design.md §Category Color Coding)
// 지정 카테고리는 고정 색, 그 외 유저 카테고리는 안정적 해시로 팔레트 순환.
// ponytail: 4색 팔레트 순환. 색 더 필요하면 팔레트만 늘리면 됨.
const FIXED: Record<string, string> = {
  개발: '#0F766E', // Deep Teal
  디자인: '#3B82F6', // Soft Blue
  비즈니스: '#64748B', // Slate
  '읽기 목록': '#14B8A6', // Light Teal
}

const PALETTE = ['#0F766E', '#3B82F6', '#64748B', '#14B8A6']

export function categoryColor(name: string): string {
  if (FIXED[name]) return FIXED[name]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]
}
