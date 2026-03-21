insert into public.pixieed_daily_metrics (
  metric_key,
  metric_date,
  metric_value,
  updated_at
)
select
  'global_dot_total_today',
  timezone('Asia/Tokyo', now())::date,
  coalesce(
    (
      select metric_value
        from public.pixieed_global_metrics
       where metric_key = 'global_dot_total'
    ),
    0
  ),
  timezone('utc', now())
on conflict (metric_key, metric_date) do update
  set metric_value = greatest(public.pixieed_daily_metrics.metric_value, excluded.metric_value),
      updated_at = timezone('utc', now());
