-- North Star Input Metrics 계측용 이벤트 로그.
-- 4종: bookmark_saved / tag_assigned / search_performed / search_result_clicked.
-- 개별 이벤트 raw 적재만 담당 — 집계는 조회 시점 GROUP BY(주간 baseline).

create table events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text not null,
  meta       jsonb not null default '{}',  -- embedding·content 등 민감정보 절대 금지
  created_at timestamptz not null default now()
);

-- 주간 집계(type·기간, user·기간)가 주 쿼리 → 복합 인덱스.
create index events_type_created_idx on events (type, created_at desc);
create index events_user_created_idx on events (user_id, created_at desc);

alter table events enable row level security;

-- 유저는 본인 이벤트만 insert(클라이언트 클릭 경로). select 정책 없음 = 조회는 service_role(관리자 집계) 전용.
create policy events_insert_own on events
  for insert to authenticated
  with check (auth.uid() = user_id);
