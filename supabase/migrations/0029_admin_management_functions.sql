-- supabase/migrations/0029_admin_management_functions.sql
-- 관리자 관리(목록/승격/강등) RPC. service_role 전용.
-- 관리자(소수 신뢰집합) 이메일만 노출 — 일반 유저 PII 아님.

-- 현재 관리자 목록 (admin_users ⨝ auth.users)
create or replace function admin_list_admins()
returns table(user_id uuid, email text, granted_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select a.user_id, u.email::text, a.granted_at
  from admin_users a
  join auth.users u on u.id = a.user_id
  order by a.granted_at;
$$;

-- 이메일로 승격: email→id 해석 후 upsert. 미존재 시 예외.
create or replace function admin_grant_by_email(p_email text, p_granted_by uuid)
returns table(user_id uuid, email text)
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then
    raise exception 'user not found' using errcode = 'no_data_found';
  end if;
  insert into admin_users(user_id, granted_by)
  values (v_id, p_granted_by)
  on conflict (user_id) do nothing;
  return query select v_id, p_email;
end;
$$;

-- 강등
create or replace function admin_revoke(p_user_id uuid)
returns void
language sql security definer set search_path = public
as $$
  delete from admin_users where user_id = p_user_id;
$$;

grant execute on function admin_list_admins() to service_role;
grant execute on function admin_grant_by_email(text, uuid) to service_role;
grant execute on function admin_revoke(uuid) to service_role;

revoke execute on function admin_list_admins() from anon, authenticated, public;
revoke execute on function admin_grant_by_email(text, uuid) from anon, authenticated, public;
revoke execute on function admin_revoke(uuid) from anon, authenticated, public;
