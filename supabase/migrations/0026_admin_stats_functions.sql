-- supabase/migrations/0026_admin_stats_functions.sql
-- /admin 대시보드 전체 사용자 집계 함수. service_role 전용 호출.
-- 반환은 집계값만 — embedding/content/user_id 미노출.

-- OKR 실측 타일
create or replace function admin_okr_stats(p_interval text)
returns table(
  active_users bigint,
  first_save_rate numeric,
  saves_per_user numeric,
  new_saves bigint
)
language sql stable
security definer
set search_path = public
as $$
  with saves as (
    select b.user_id, count(*) as c
    from bookmarks b
    where b.created_at >= now() - p_interval::interval
    group by b.user_id
  ),
  signups as (
    select u.id from auth.users u where u.created_at >= now() - p_interval::interval
  )
  select
    (select count(*) from saves)::bigint as active_users,
    -- first_save_rate: "이 윈도우 내 가입자 중 이 시점까지 북마크를 한 번이라도 저장한 비율"(누적 활성화율)이며,
    -- "윈도우 내 저장"이 아님 — created_at 하한이 없어 짧은/최근 윈도우일수록
    -- 가입 직후라 저장할 시간이 부족해 비율이 구조적으로 낮게 나올 수 있음
    coalesce(
      (select count(*) from signups s
         where exists (select 1 from bookmarks b where b.user_id = s.id))::numeric
      / nullif((select count(*) from signups), 0),
      0
    ) as first_save_rate,
    coalesce(
      (select sum(c) from saves)::numeric / nullif((select count(*) from saves), 0),
      0
    ) as saves_per_user,
    coalesce((select sum(c) from saves), 0)::bigint as new_saves;
$$;

-- 카테고리 분포 (유저별 categories 테이블 → name 기준 집계, null → 미분류)
create or replace function admin_category_stats(p_interval text)
returns table(name text, count bigint)
language sql stable
security definer
set search_path = public
as $$
  select coalesce(c.name, '미분류') as name, count(*)::bigint as count
  from bookmarks b
  left join categories c on b.category_id = c.id
  where b.created_at >= now() - p_interval::interval
  group by coalesce(c.name, '미분류')
  order by count(*) desc;
$$;

-- 특정 카테고리의 하위 태그 분포 (tags 배열 unnest)
create or replace function admin_tag_stats(p_category text, p_interval text)
returns table(tag text, count bigint)
language sql stable
security definer
set search_path = public
as $$
  select t as tag, count(*)::bigint as count
  from bookmarks b
  left join categories c on b.category_id = c.id
  cross join lateral unnest(b.tags) as t
  where b.created_at >= now() - p_interval::interval
    and coalesce(c.name, '미분류') = p_category
  group by t
  order by count(*) desc;
$$;

grant execute on function admin_okr_stats(text) to service_role;
grant execute on function admin_category_stats(text) to service_role;
grant execute on function admin_tag_stats(text, text) to service_role;

-- 익명/인증 롤에는 실행권 부여 안 함 (전체 사용자 집계 노출 방지)
revoke execute on function admin_okr_stats(text) from anon, authenticated;
revoke execute on function admin_category_stats(text) from anon, authenticated;
revoke execute on function admin_tag_stats(text, text) from anon, authenticated;

-- PostgreSQL은 CREATE FUNCTION 시 PUBLIC에 EXECUTE를 자동 부여하므로,
-- anon/authenticated 회수만으로는 불충분 — PUBLIC 기본 권한을 명시적으로 회수해야
-- PostgREST를 통한 미인증 호출까지 완전히 차단됨
revoke execute on function admin_okr_stats(text) from public;
revoke execute on function admin_category_stats(text) from public;
revoke execute on function admin_tag_stats(text, text) from public;
