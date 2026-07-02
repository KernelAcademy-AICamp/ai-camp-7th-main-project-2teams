-- 백업/롤백 스냅샷 테이블 RLS 활성화.
-- 문제: RLS 꺼진 채라 anon 키(클라 번들 공개)로 전 유저 북마크·embedding 열람 가능.
-- 조치: 정책 미추가로 anon/authenticated 전면 차단. service_role은 RLS 우회 →
--       마이그레이션(0006 복원)·백필/재태깅 스크립트는 그대로 동작.
-- 데이터는 보존(롤백 소스 유지). 되돌리려면 각 테이블 DISABLE ROW LEVEL SECURITY.

ALTER TABLE public.bookmarks_backup_bge_m3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks_backup_20260630 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks_retag_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks_tags_backup_20260701 ENABLE ROW LEVEL SECURITY;
