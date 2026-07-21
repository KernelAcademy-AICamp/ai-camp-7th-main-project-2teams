-- supabase/migrations/0031_metrics_aggregation.sql
-- North Star 지표 주간 집계. service_role 전용. 반환은 집계값만 — user_id/embedding/content 미노출.
-- docs/specs/metrics.md '지표 ← 이벤트 매핑' 표 구현. events(0030) 기반.

-- 주간 지표 별자리: 최근 p_weeks주(기본 8) 각 주(월요일 시작 date_trunc('week')) 버킷.
-- generate_series로 이벤트 없는 주도 0-채움(연속 시계열).
-- 컬럼 ↔ metrics.md 매핑:
--   new_saves       = 주간 bookmark_saved count (Input#1 신규 저장)
--   auto_coverage   = tag_assigned 중 meta.auto_category=true 비율 (Input#2 자동분류 커버리지)
--   search_success  = search_result_clicked / search_performed (Input#3 검색 성공률)
--   active_curators = 주간 bookmark_saved+search_performed 동시 발생 유저 수 (Input#4)
--   retrieved       = 주간 search_result_clicked count (★ North Star: 되찾은 북마크)
create or replace function admin_metrics_weekly(p_weeks int default 8)
returns table(
  week            timestamptz,
  new_saves       bigint,
  auto_coverage   numeric,
  search_success  numeric,
  active_curators bigint,
  retrieved       bigint
)
language sql stable security definer set search_path = public
as $$
  with buckets as (
    select generate_series(
      date_trunc('week', now()) - ((p_weeks - 1) * interval '1 week'),
      date_trunc('week', now()),
      interval '1 week'
    ) as week
  ),
  ev as (
    select date_trunc('week', created_at) as week, user_id, type, meta
    from events
    where created_at >= date_trunc('week', now()) - ((p_weeks - 1) * interval '1 week')
  ),
  agg as (
    select
      week,
      count(*) filter (where type = 'bookmark_saved')::bigint as new_saves,
      -- meta.auto_category는 'true'/'false' 텍스트 → boolean → int 평균 = 비율. 키 없으면 null이라 avg서 제외.
      coalesce(avg((meta->>'auto_category')::boolean::int)
                 filter (where type = 'tag_assigned'), 0)::numeric as auto_coverage,
      -- 분모 0(검색 없는 주)이면 nullif로 null → coalesce 0. 0으로 나눔 방지.
      coalesce(count(*) filter (where type = 'search_result_clicked')::numeric
                 / nullif(count(*) filter (where type = 'search_performed'), 0), 0)::numeric as search_success,
      count(*) filter (where type = 'search_result_clicked')::bigint as retrieved
    from ev
    group by week
  ),
  -- 활성 큐레이터: 같은 주에 저장 AND 검색 둘 다 한 유저. having count(distinct type)=2로 정확한 교집합.
  curators as (
    select week, count(*)::bigint as active_curators
    from (
      select week, user_id
      from ev
      where type in ('bookmark_saved', 'search_performed')
      group by week, user_id
      having count(distinct type) = 2
    ) x
    group by week
  )
  select
    b.week,
    coalesce(a.new_saves, 0)::bigint,
    coalesce(a.auto_coverage, 0)::numeric,
    coalesce(a.search_success, 0)::numeric,
    coalesce(c.active_curators, 0)::bigint,
    coalesce(a.retrieved, 0)::bigint
  from buckets b
  left join agg a on a.week = b.week
  left join curators c on c.week = b.week
  order by b.week;
$$;

grant execute on function admin_metrics_weekly(int) to service_role;
revoke execute on function admin_metrics_weekly(int) from anon, authenticated, public;

-- 검증(psql/SQL Editor에서 수동 실행):
--   select * from admin_metrics_weekly(8);   -- 8주치, 이벤트 없는 주는 전부 0
--   anon 키로 호출 시 permission denied(revoke 확인)
