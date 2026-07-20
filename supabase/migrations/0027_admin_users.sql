-- 관리자 판별을 env var(ADMIN_USER_IDS) allowlist에서 DB 테이블로 전환.
-- redeploy 없이 승격/강등 가능, 감사 추적(granted_by/granted_at) 확보.

create table admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now()
);

alter table admin_users enable row level security;
-- 정책을 하나도 만들지 않음 = RLS 기본 거부. service_role만 RLS 우회로 직접 접근.

-- authenticated 세션이 본인 관리자 여부만 확인할 수 있도록 SECURITY DEFINER 함수로 노출.
-- 파라미터 없이 auth.uid()로 호출자 본인만 조회 — 임의 uuid를 받으면 타인의
-- 관리자 여부를 조회하는 정보노출 경로가 생기므로 의도적으로 인자를 두지 않음.
-- admin_users 테이블 자체는 RLS로 잠겨 있어 authenticated가 직접 select 불가.
create or replace function is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists(select 1 from admin_users where user_id = auth.uid());
$$;

grant execute on function is_admin() to authenticated;
revoke execute on function is_admin() from anon, public;

-- 관리자 승격/강등은 마이그레이션이 아닌 수동 SQL로 수행 (docs/specs/database.md 참조).
-- 특정 유저를 마이그레이션에 하드코딩하면 환경(dev/staging/prod) 비종속성이 깨짐.
