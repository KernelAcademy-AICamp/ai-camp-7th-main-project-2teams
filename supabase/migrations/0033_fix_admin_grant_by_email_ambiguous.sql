-- 0029의 admin_grant_by_email 버그 수정.
-- returns table(user_id, email) 의 출력 변수가 본문의 컬럼 참조와 충돌해
-- 42702 "column reference is ambiguous" 로 항상 실패했다(이메일 존재 여부 무관).
--   - where lower(email)   → auth.users alias 로 한정
--   - on conflict (user_id) → user_id 가 PK 이므로 conflict target 생략
create or replace function admin_grant_by_email(p_email text, p_granted_by uuid)
returns table(user_id uuid, email text)
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  select u.id into v_id from auth.users u where lower(u.email) = lower(p_email);
  if v_id is null then
    raise exception 'user not found' using errcode = 'no_data_found';
  end if;
  insert into admin_users(user_id, granted_by)
  values (v_id, p_granted_by)
  on conflict do nothing;
  return query select v_id, p_email;
end;
$$;

grant execute on function admin_grant_by_email(text, uuid) to service_role;
revoke execute on function admin_grant_by_email(text, uuid) from anon, authenticated, public;
