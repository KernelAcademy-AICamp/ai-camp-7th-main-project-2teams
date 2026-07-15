// 저장 성공 시 카테고리/태그 미리보기 텍스트 — popup 토스트·백그라운드 알림 공용 (A22)
export function formatBookmarkPreview(bookmark) {
  const category = bookmark?.category ? `[${bookmark.category}] ` : ''
  const tags = bookmark?.tags?.length ? bookmark.tags.join(' · ') : '태그 없음'
  return `${category}${tags}`
}
