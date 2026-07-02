// 카테고리 컬러코딩 (Design.md §Category Color Coding)
// 지정 카테고리는 고정 색, 그 외 유저 카테고리는 안정적 해시로 팔레트 순환.
// ponytail: 4색 팔레트 순환. 색 더 필요하면 팔레트만 늘리면 됨.
const FIXED: Record<string, string> = {
  개발: '#4A90E2', // Vibrant Blue
  디자인: '#48C9B0', // Mint
  비즈니스: '#64748B', // Slate
  '읽기 목록': '#2D3E50', // Deep Blue
}

const PALETTE = ['#4A90E2', '#48C9B0', '#64748B', '#2D3E50', '#3B82F6']

export function categoryColor(name: string): string {
  if (FIXED[name]) return FIXED[name]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]
}
