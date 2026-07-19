-- Authenticated creator dashboard. Keep chart aggregation on the server so the
-- browser never has to download individual purchase or allocation rows.

create or replace function public.market_my_reward_dashboard_v1(
  input_months integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_months integer := least(24, greatest(6, coalesce(input_months, 12)));
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'login required';
  end if;

  with month_axis as (
    select generate_series(
      date_trunc('month', timezone('Asia/Tokyo', now()))::date - ((v_months - 1) * interval '1 month'),
      date_trunc('month', timezone('Asia/Tokyo', now()))::date,
      interval '1 month'
    )::date as month_start
  ), ledger_monthly as (
    select
      date_trunc('month', timezone('Asia/Tokyo', coalesce(purchase.paid_at, ledger.created_at)))::date as month_start,
      coalesce(sum(ledger.amount_microyen) filter (where ledger.lineage_depth = 0), 0)::bigint as sales_microyen,
      coalesce(sum(ledger.amount_microyen) filter (where ledger.lineage_depth > 0), 0)::bigint as lineage_microyen,
      count(distinct ledger.purchase_id) filter (where ledger.lineage_depth = 0)::bigint as sale_count,
      count(distinct ledger.purchase_id) filter (where ledger.lineage_depth > 0)::bigint as lineage_sale_count
    from public.market_royalty_ledger ledger
    join public.market_purchases purchase on purchase.id = ledger.purchase_id
    where ledger.recipient_user_id = v_user_id
      and ledger.status <> 'reversed'
      and coalesce(purchase.paid_at, ledger.created_at) >= (select min(month_start) from month_axis)
    group by 1
  ), pageview_sources as (
    select
      make_date(allocation.reward_year, allocation.reward_month, 1) as month_start,
      allocation.source_asset_id,
      max(allocation.source_view_count)::bigint as valid_view_count,
      sum(allocation.amount_microyen)::bigint as pageview_microyen
    from public.market_pageview_reward_allocations allocation
    join public.market_pageview_reward_runs run
      using (reward_year, reward_month)
    where allocation.recipient_user_id = v_user_id
      and run.status = 'finalized'
      and make_date(allocation.reward_year, allocation.reward_month, 1) >= (select min(month_start) from month_axis)
    group by 1, allocation.source_asset_id
  ), pageview_monthly as (
    select month_start,
      sum(pageview_microyen)::bigint as pageview_microyen,
      sum(valid_view_count)::bigint as valid_view_count
    from pageview_sources
    group by month_start
  ), monthly as (
    select axis.month_start,
      coalesce(ledger.sales_microyen, 0)::bigint as sales_microyen,
      coalesce(ledger.lineage_microyen, 0)::bigint as lineage_microyen,
      coalesce(pageviews.pageview_microyen, 0)::bigint as pageview_microyen,
      coalesce(pageviews.valid_view_count, 0)::bigint as valid_view_count,
      coalesce(ledger.sale_count, 0)::bigint as sale_count,
      coalesce(ledger.lineage_sale_count, 0)::bigint as lineage_sale_count
    from month_axis axis
    left join ledger_monthly ledger using (month_start)
    left join pageview_monthly pageviews using (month_start)
    order by axis.month_start
  ), balances as (
    select
      coalesce(sum(greatest(ledger.amount_microyen - ledger.paid_microyen, 0))
        filter (where ledger.status = 'available'), 0)::bigint as available_microyen,
      coalesce(sum(greatest(ledger.amount_microyen - ledger.paid_microyen, 0))
        filter (where ledger.status = 'pending'), 0)::bigint as pending_microyen
    from public.market_royalty_ledger ledger
    where ledger.recipient_user_id = v_user_id
  )
  select jsonb_build_object(
    'months', v_months,
    'currency', 'jpy',
    'totals', jsonb_build_object(
      'sales_microyen', coalesce(sum(monthly.sales_microyen), 0),
      'lineage_microyen', coalesce(sum(monthly.lineage_microyen), 0),
      'pageview_microyen', coalesce(sum(monthly.pageview_microyen), 0),
      'valid_view_count', coalesce(sum(monthly.valid_view_count), 0),
      'sale_count', coalesce(sum(monthly.sale_count), 0),
      'lineage_sale_count', coalesce(sum(monthly.lineage_sale_count), 0),
      'available_microyen', (select available_microyen from balances),
      'pending_microyen', (select pending_microyen from balances)
    ),
    'series', coalesce(jsonb_agg(jsonb_build_object(
      'month', to_char(monthly.month_start, 'YYYY-MM'),
      'sales_microyen', monthly.sales_microyen,
      'lineage_microyen', monthly.lineage_microyen,
      'pageview_microyen', monthly.pageview_microyen,
      'valid_view_count', monthly.valid_view_count,
      'sale_count', monthly.sale_count,
      'lineage_sale_count', monthly.lineage_sale_count
    ) order by monthly.month_start), '[]'::jsonb)
  ) into v_result
  from monthly;

  return v_result;
end;
$$;

revoke all on function public.market_my_reward_dashboard_v1(integer)
  from public, anon;
grant execute on function public.market_my_reward_dashboard_v1(integer)
  to authenticated;
