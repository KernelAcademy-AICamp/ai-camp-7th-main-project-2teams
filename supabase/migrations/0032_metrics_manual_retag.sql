-- supabase/migrations/0032_metrics_manual_retag.sql
-- 수동 재태깅(tag_assigned{source:'manual'}) 계측 반영. admin_metrics_weekly(0031) 갱신.
-- 변경 2:
--   1) auto_coverage를 source='auto'로 한정 — 수동 이벤트(auto_category=false) 유입으로 자동분류 비율 오염 방지.
--   2) manual_retags 컬럼 추가 — 자동 대비 수동 교정률 측정용.
-- 반환 컬럼(시그니처) 변경이라 create-or-replace 불가 → drop 후 재생성.

drop function if exists admin_metrics_weekly(int);

create function admin_metrics_weekly(p_weeks int default 8)
returns table(
  week            timestamptz,
  new_saves       bigint,
  auto_coverage   numeric,
  search_success  numeric,
  active_curators bigint,
  retrieved       bigint,
  manual_retags   bigint
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
      -- 자동분류 커버리지: source='auto' 태깅만 대상(수동 편집 제외). meta.auto_category 'true'/'false' → 비율.
      coalesce(avg((meta->>'auto_category')::boolean::int)
                 filter (where type = 'tag_assigned' and meta->>'source' = 'auto'), 0)::numeric as auto_coverage,
      -- 검색 성공률: 분모 0이면 nullif로 null → coalesce 0.
      coalesce(count(*) filter (where type = 'search_result_clicked')::numeric
                 / nullif(count(*) filter (where type = 'search_performed'), 0), 0)::numeric as search_success,
      count(*) filter (where type = 'search_result_clicked')::bigint as retrieved,
      -- 수동 재태깅(카드 편집): 자동 대비 교정 빈도.
      count(*) filter (where type = 'tag_assigned' and meta->>'source' = 'manual')::bigint as manual_retags
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
    coalesce(a.retrieved, 0)::bigint,
    coalesce(a.manual_retags, 0)::bigint
  from buckets b
  left join agg a on a.week = b.week
  left join curators c on c.week = b.week
  order by b.week;
$$;

grant execute on function admin_metrics_weekly(int) to service_role;
revoke execute on function admin_metrics_weekly(int) from anon, authenticated, public;

-- 검증(SQL Editor):
--   select * from admin_metrics_weekly(8);   -- manual_retags 컬럼 포함, auto_coverage는 auto 태깅만 반영
