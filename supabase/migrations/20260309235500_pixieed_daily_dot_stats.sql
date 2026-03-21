create table if not exists public.pixieed_daily_metrics (
  metric_key text not null,
  metric_date date not null,
  metric_value bigint not null default 0 check (metric_value >= 0),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (metric_key, metric_date)
);

alter table public.pixieed_daily_metrics enable row level security;

revoke all on public.pixieed_daily_metrics from anon, authenticated;

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
  v_positive_delta bigint := 0;
  v_total bigint := 0;
  v_today_date_jst date := timezone('Asia/Tokyo', now())::date;
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

  v_positive_delta := greatest(v_delta, 0);

  insert into public.pixieed_global_metrics (
    metric_key,
    metric_value,
    updated_at
  ) values (
    'global_dot_total',
    v_positive_delta,
    timezone('utc', now())
  )
  on conflict (metric_key) do update
    set metric_value = greatest(0, public.pixieed_global_metrics.metric_value + v_delta),
        updated_at = timezone('utc', now());

  select metric_value
    into v_total
    from public.pixieed_global_metrics
   where metric_key = 'global_dot_total';

  if v_positive_delta > 0 then
    insert into public.pixieed_daily_metrics (
      metric_key,
      metric_date,
      metric_value,
      updated_at
    ) values (
      'global_dot_total_today',
      v_today_date_jst,
      v_positive_delta,
      timezone('utc', now())
    )
    on conflict (metric_key, metric_date) do update
      set metric_value = public.pixieed_daily_metrics.metric_value + excluded.metric_value,
          updated_at = timezone('utc', now());
  end if;

  return coalesce(v_total, 0);
end;
$$;

create or replace function public.get_global_dot_stats()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'all_time_total',
    coalesce(
      (
        select metric_value
          from public.pixieed_global_metrics
         where metric_key = 'global_dot_total'
      ),
      0
    ),
    'today_total',
    coalesce(
      (
        select metric_value
          from public.pixieed_daily_metrics
         where metric_key = 'global_dot_total_today'
           and metric_date = timezone('Asia/Tokyo', now())::date
      ),
      0
    ),
    'today_date_jst',
    to_char(timezone('Asia/Tokyo', now())::date, 'YYYY-MM-DD'),
    'timezone_label',
    'Asia/Tokyo'
  );
$$;

grant execute on function public.get_global_dot_stats() to anon, authenticated;
