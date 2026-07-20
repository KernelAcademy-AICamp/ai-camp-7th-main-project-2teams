-- 관리자 판별을 env var(ADMIN_USER_IDS) allowlist에서 DB 테이블로 전환.
-- redeploy 없이 승격/강등 가능, 감사 추적(granted_by/granted_at) 확보.

create table admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now()
);

alter table admin_users enable row level security;
-- 정책을 하나도 만들지 않음 = RLS 기본 거부. service_role만 RLS 우회로 직접 접근.

-- authenticated 세션이 본인 관리자 여부를 확인할 수 있도록 SECURITY DEFINER 함수로 노출.
-- admin_users 테이블 자체는 RLS로 잠겨 있어 authenticated가 직접 select 불가.
create or replace function is_admin(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists(select 1 from admin_users where user_id = p_user_id);
$$;

grant execute on function is_admin(uuid) to authenticated;
revoke execute on function is_admin(uuid) from anon, public;

-- 기존 ADMIN_USER_IDS 값 시드 (yilpe93@gmail.com)
insert into admin_users (user_id) values ('0c570894-842b-4840-8312-e5da4948c072');
