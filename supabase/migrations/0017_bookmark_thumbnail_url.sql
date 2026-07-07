-- 북마크 카드 썸네일 표시용 원본 이미지 URL(og:image/YouTube 썸네일) 저장.
-- 이미지 자체는 저장하지 않고 URL만 보관 — 실제 바이트는 /api/thumbnail 프록시가 요청 시점에
-- fetch해 CDN edge에서만 캐시(TTL 만료 시 재요청). DB/스토리지에 이미지 영구 복제 없음.
ALTER TABLE bookmarks
  ADD COLUMN thumbnail_url TEXT;
