-- supabase/migrations/0028_admin_v2_stats_functions.sql
-- /admin v2 집계 함수. service_role 전용. 반환은 집계값만 — embedding/content/user_id 미노출.

-- 성장 추이: 신규 가입(auth.users) + 저장(bookmarks) 시계열.
-- 1d=시간별, 7d/30d=일별 버킷. generate_series로 빈 버킷 0-채움(연속 그래프).
create or replace function admin_growth_series(p_interval text)
returns table(bucket timestamptz, signups bigint, saves bigint)
language sql stable security definer set search_path = public
as $$
  with cfg as (
    select
      case p_interval when '1 day' then interval '1 day'
                      when '7 days' then interval '7 days'
                      else interval '30 days' end as win,
      case p_interval when '1 day' then interval '1 hour' else interval '1 day' end as step,
      case p_interval when '1 day' then 'hour' else 'day' end as unit
  ),
  buckets as (
    select generate_series(
      date_trunc((select unit from cfg), now() - (select win from cfg)),
      date_trunc((select unit from cfg), now()),
      (select step from cfg)
    ) as bucket
  )
  select
    b.bucket,
    (select count(*) from auth.users u
       where date_trunc((select unit from cfg), u.created_at) = b.bucket)::bigint as signups,
    (select count(*) from bookmarks bm
       where date_trunc((select unit from cfg), bm.created_at) = b.bucket)::bigint as saves
  from buckets b
  order by b.bucket;
$$;

-- 트렌딩 태그: 현재 윈도우 vs 직전 동일 윈도우 delta 상위 10.
create or replace function admin_trending_tags(p_interval text)
returns table(tag text, count bigint, prev_count bigint)
language sql stable security definer set search_path = public
as $$
  with cfg as (
    select case p_interval when '1 day' then interval '1 day'
                           when '7 days' then interval '7 days'
                           else interval '30 days' end as win
  ),
  cur as (
    select t as tag, count(*)::bigint as c
    from bookmarks b cross join lateral unnest(b.tags) as t
    where b.created_at >= now() - (select win from cfg)
    group by t
  ),
  prev as (
    select t as tag, count(*)::bigint as c
    from bookmarks b cross join lateral unnest(b.tags) as t
    where b.created_at >= now() - 2 * (select win from cfg)
      and b.created_at <  now() - (select win from cfg)
    group by t
  )
  select coalesce(cur.tag, prev.tag) as tag,
         coalesce(cur.c, 0) as count,
         coalesce(prev.c, 0) as prev_count
  from cur full outer join prev on cur.tag = prev.tag
  where coalesce(cur.c, 0) > 0
  order by (coalesce(cur.c, 0) - coalesce(prev.c, 0)) desc, coalesce(cur.c, 0) desc
  limit 10;
$$;

-- 건강 지표: 데드링크·미분류 누적 비율(전체 기간, 무인자).
create or replace function admin_health_stats()
returns table(dead_ratio numeric, uncategorized_ratio numeric)
language sql stable security definer set search_path = public
as $$
  select
    coalesce(avg((is_dead)::int), 0)::numeric as dead_ratio,
    coalesce(avg((category_id is null)::int), 0)::numeric as uncategorized_ratio
  from bookmarks;
$$;

grant execute on function admin_growth_series(text) to service_role;
grant execute on function admin_trending_tags(text) to service_role;
grant execute on function admin_health_stats() to service_role;

revoke execute on function admin_growth_series(text) from anon, authenticated, public;
revoke execute on function admin_trending_tags(text) from anon, authenticated, public;
revoke execute on function admin_health_stats() from anon, authenticated, public;
