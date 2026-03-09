create table if not exists public.pixieed_project_dot_counts (
  project_id text primary key,
  app text not null default 'pixieed',
  dot_count bigint not null default 0 check (dot_count >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.pixieed_global_metrics (
  metric_key text primary key,
  metric_value bigint not null default 0 check (metric_value >= 0),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.pixieed_global_metrics (metric_key, metric_value)
values ('global_dot_total', 0)
on conflict (metric_key) do nothing;

alter table public.pixieed_project_dot_counts enable row level security;
alter table public.pixieed_global_metrics enable row level security;

revoke all on public.pixieed_project_dot_counts from anon, authenticated;
revoke all on public.pixieed_global_metrics from anon, authenticated;

create or replace function public.sync_project_dot_count(
  p_project_id text,
  p_dot_count bigint,
  p_app text default 'pixieed'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id text := left(trim(coalesce(p_project_id, '')), 120);
  v_app text := coalesce(nullif(trim(p_app), ''), 'pixieed');
  v_next_count bigint := greatest(coalesce(p_dot_count, 0), 0);
  v_previous_count bigint := null;
  v_delta bigint := 0;
  v_total bigint := 0;
begin
  if v_project_id = '' then
    raise exception 'project_id is required';
  end if;

  select dot_count
    into v_previous_count
    from public.pixieed_project_dot_counts
   where project_id = v_project_id
   for update;

  if found then
    update public.pixieed_project_dot_counts
       set app = v_app,
           dot_count = v_next_count,
           updated_at = timezone('utc', now())
     where project_id = v_project_id;
    v_delta := v_next_count - coalesce(v_previous_count, 0);
  else
    insert into public.pixieed_project_dot_counts (
      project_id,
      app,
      dot_count
    ) values (
      v_project_id,
      v_app,
      v_next_count
    );
    v_delta := v_next_count;
  end if;

  insert into public.pixieed_global_metrics (
    metric_key,
    metric_value,
    updated_at
  ) values (
    'global_dot_total',
    greatest(v_delta, 0),
    timezone('utc', now())
  )
  on conflict (metric_key) do update
    set metric_value = greatest(0, public.pixieed_global_metrics.metric_value + v_delta),
        updated_at = timezone('utc', now());

  select metric_value
    into v_total
    from public.pixieed_global_metrics
   where metric_key = 'global_dot_total';

  return coalesce(v_total, 0);
end;
$$;

create or replace function public.get_global_dot_total()
returns bigint
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (
      select metric_value
        from public.pixieed_global_metrics
       where metric_key = 'global_dot_total'
    ),
    0
  );
$$;

grant execute on function public.sync_project_dot_count(text, bigint, text) to anon, authenticated;
grant execute on function public.get_global_dot_total() to anon, authenticated;
