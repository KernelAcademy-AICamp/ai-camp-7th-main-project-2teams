// youtube.com, youtu.be 두 도메인 모두에서 11자리 영상 ID 추출
const YOUTUBE_ID_RE =
  /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/

export function extractYoutubeId(url: string): string | null {
  const match = YOUTUBE_ID_RE.exec(url)
  return match ? match[1] : null
}
