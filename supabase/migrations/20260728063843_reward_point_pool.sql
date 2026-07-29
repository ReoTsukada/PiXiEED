-- One monthly creator-reward pool.  A valid market display contributes two
-- points across its direct lineage; a valid PiXFiND play contributes three
-- points to its creator.  The configured monthly amount is divided by the
-- resulting creator-point ratio, not by a fixed PV price.

alter table public.market_pageview_reward_runs
  add column if not exists valid_play_count bigint not null default 0 check (valid_play_count >= 0),
  add column if not exists total_point_units numeric not null default 0 check (total_point_units >= 0);

create table if not exists public.creator_play_reward_allocations (
  reward_year integer not null,
  reward_month integer not null,
  app_key text not null,
  content_key text not null,
  recipient_user_id uuid not null references auth.users(id) on delete restrict,
  valid_play_count bigint not null check (valid_play_count > 0),
  point_units numeric not null check (point_units > 0),
  amount_microyen bigint not null check (amount_microyen >= 0),
  paid_microyen bigint not null default 0 check (paid_microyen >= 0 and paid_microyen <= amount_microyen),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (reward_year, reward_month, app_key, content_key, recipient_user_id),
  foreign key (reward_year, reward_month)
    references public.market_pageview_reward_runs(reward_year, reward_month) on delete cascade,
  foreign key (app_key, content_key)
    references public.creator_reward_contents(app_key, content_key) on delete restrict
);
create index if not exists creator_play_reward_allocations_recipient_idx
  on public.creator_play_reward_allocations(recipient_user_id, reward_year desc, reward_month desc);
alter table public.creator_play_reward_allocations enable row level security;
revoke all on public.creator_play_reward_allocations from public, anon, authenticated;

-- The 2-point display total is split only among the viewed work's direct
-- lineage.  Sibling branches are deliberately not part of this relation.
create or replace function public.market_admin_calculate_pageview_rewards_v1(
  input_year integer,
  input_month integer,
  input_finalize boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date := make_date(input_year, input_month, 1);
  v_end date := (make_date(input_year, input_month, 1) + interval '1 month')::date;
  v_budget_yen bigint;
  v_total_views bigint;
  v_total_plays bigint;
  v_total_points numeric;
  v_budget_microyen bigint;
  v_allocated bigint;
  v_existing_status text;
  v_now timestamptz := timezone('utc', now());
begin
  if not public.market_current_user_is_admin() then raise exception 'admin permission required'; end if;
  if input_year is null or input_year < 2025 or input_year > 2100 or input_month is null or input_month not between 1 and 12 then
    raise exception 'valid reward year and month are required';
  end if;
  if input_finalize and v_end > (timezone('utc', now()))::date then raise exception 'the reward month can be finalized only after it ends'; end if;
  select amount_yen into v_budget_yen from public.market_pageview_reward_budgets
    where reward_year = input_year and reward_month = input_month for share;
  if not found then raise exception 'monthly reward budget is not configured'; end if;
  select status into v_existing_status from public.market_pageview_reward_runs
    where reward_year = input_year and reward_month = input_month for update;
  if v_existing_status = 'finalized' then raise exception 'creator reward month is already finalized'; end if;

  select count(*) into v_total_views from public.market_pageview_events
    where status = 'valid' and view_day >= v_start and view_day < v_end;
  select count(*) into v_total_plays from public.creator_play_events
    where status = 'valid' and app_key = 'pixfind' and creator_user_id is not null and play_day >= v_start and play_day < v_end;
  v_total_points := v_total_views::numeric * 2 + v_total_plays::numeric * 3;
  v_budget_microyen := v_budget_yen * 1000000;

  insert into public.market_pageview_reward_runs(reward_year,reward_month,budget_yen,valid_view_count,valid_play_count,total_point_units,allocated_microyen,remainder_microyen,status,calculated_at)
  values (input_year,input_month,v_budget_yen,v_total_views,v_total_plays,v_total_points,0,v_budget_microyen,'draft',v_now)
  on conflict (reward_year,reward_month) do update set budget_yen=excluded.budget_yen, valid_view_count=excluded.valid_view_count,
    valid_play_count=excluded.valid_play_count,total_point_units=excluded.total_point_units,allocated_microyen=0,remainder_microyen=excluded.remainder_microyen,
    status='draft',calculated_at=excluded.calculated_at,finalized_at=null,finalized_by=null;
  delete from public.market_pageview_reward_allocations where reward_year=input_year and reward_month=input_month;
  delete from public.creator_play_reward_allocations where reward_year=input_year and reward_month=input_month;

  if v_total_points > 0 and v_budget_microyen > 0 then
    with recursive source_views as (
      select asset_id as source_asset_id, count(*)::bigint as view_count from public.market_pageview_events
      where status='valid' and view_day>=v_start and view_day<v_end group by asset_id
    ), tree as (
      select id,parent_asset_id,creator_user_id,0 as generation_index from public.market_assets
      where parent_asset_id is null and status='published' and published_at<v_end
      union all select child.id,child.parent_asset_id,child.creator_user_id,tree.generation_index+1
      from tree join public.market_assets child on child.parent_asset_id=tree.id where child.status='published' and child.published_at<v_end
    ), ancestors as (
      select views.source_asset_id,tree.id as recipient_asset_id from source_views views join tree on tree.id=views.source_asset_id
      union all select lineage.source_asset_id,parent.id from ancestors lineage
      join public.market_assets current_asset on current_asset.id=lineage.recipient_asset_id join tree parent on parent.id=current_asset.parent_asset_id
    ), descendants as (
      select views.source_asset_id,tree.id as recipient_asset_id from source_views views join tree on tree.id=views.source_asset_id
      union all select lineage.source_asset_id,child.id from descendants lineage join tree child on child.parent_asset_id=lineage.recipient_asset_id
    ), eligible as (
      select source_asset_id,recipient_asset_id from ancestors union select source_asset_id,recipient_asset_id from descendants
    ), recipients as (
      select eligible.source_asset_id,eligible.recipient_asset_id,tree.creator_user_id as recipient_user_id,tree.generation_index,views.view_count
      from eligible join tree on tree.id=eligible.recipient_asset_id join source_views views on views.source_asset_id=eligible.source_asset_id
    ), generations as (select source_asset_id,count(distinct generation_index)::integer as generation_count from recipients group by source_asset_id),
    peers as (select source_asset_id,generation_index,count(*)::integer as works_in_generation from recipients group by source_asset_id,generation_index)
    insert into public.market_pageview_reward_allocations(reward_year,reward_month,source_asset_id,recipient_asset_id,recipient_user_id,source_view_count,generation_index,generation_count,works_in_generation,amount_microyen)
    select input_year,input_month,r.source_asset_id,r.recipient_asset_id,r.recipient_user_id,r.view_count,r.generation_index,g.generation_count,p.works_in_generation,
      floor(v_budget_microyen::numeric * (r.view_count::numeric * 2 / g.generation_count / p.works_in_generation) / v_total_points)::bigint
    from recipients r join generations g using(source_asset_id) join peers p using(source_asset_id,generation_index);

    insert into public.creator_play_reward_allocations(reward_year,reward_month,app_key,content_key,recipient_user_id,valid_play_count,point_units,amount_microyen)
    select input_year,input_month,event.app_key,event.content_key,event.creator_user_id,count(*)::bigint,count(*)::numeric*3,
      floor(v_budget_microyen::numeric * (count(*)::numeric * 3) / v_total_points)::bigint
    from public.creator_play_events event
    where event.status='valid' and event.app_key='pixfind' and event.creator_user_id is not null and event.play_day>=v_start and event.play_day<v_end
    group by event.app_key,event.content_key,event.creator_user_id;
  end if;
  select coalesce(sum(amount_microyen),0) into v_allocated from (
    select amount_microyen from public.market_pageview_reward_allocations where reward_year=input_year and reward_month=input_month
    union all select amount_microyen from public.creator_play_reward_allocations where reward_year=input_year and reward_month=input_month
  ) allocated;
  update public.market_pageview_reward_runs set allocated_microyen=v_allocated,remainder_microyen=greatest(0,v_budget_microyen-v_allocated),
    status=case when input_finalize then 'finalized' else 'draft' end,finalized_at=case when input_finalize then v_now else null end,finalized_by=case when input_finalize then auth.uid() else null end
    where reward_year=input_year and reward_month=input_month;
  return jsonb_build_object('year',input_year,'month',input_month,'status',case when input_finalize then 'finalized' else 'draft' end,
    'budget_yen',v_budget_yen,'valid_view_count',v_total_views,'valid_play_count',v_total_plays,'total_points',v_total_points,
    'allocated_microyen',v_allocated,'remainder_microyen',greatest(0,v_budget_microyen-v_allocated));
end;
$$;

-- Dashboard values are estimates only until the month is finalized.  The
-- estimate uses the same live point formula, so it can change as new events arrive.
create or replace function public.market_my_reward_dashboard_v1(input_months integer default 12)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_months integer:=least(24,greatest(6,coalesce(input_months,12))); v_user_id uuid:=auth.uid(); v_result jsonb;
begin
  if v_user_id is null then raise exception 'login required'; end if;
  with month_axis as (
    select generate_series(date_trunc('month',timezone('Asia/Tokyo',now()))::date-((v_months-1)*interval '1 month'),date_trunc('month',timezone('Asia/Tokyo',now()))::date,interval '1 month')::date month_start
  ), ledger_monthly as (
    select date_trunc('month', timezone('Asia/Tokyo', coalesce(purchase.paid_at, ledger.created_at)))::date month_start,
      coalesce(sum(ledger.amount_microyen) filter(where ledger.lineage_depth=0),0)::bigint sales_microyen,
      coalesce(sum(ledger.amount_microyen) filter(where ledger.lineage_depth>0),0)::bigint lineage_microyen,
      count(distinct ledger.purchase_id) filter(where ledger.lineage_depth=0)::bigint sale_count,
      count(distinct ledger.purchase_id) filter(where ledger.lineage_depth>0)::bigint lineage_sale_count
    from public.market_royalty_ledger ledger join public.market_purchases purchase on purchase.id=ledger.purchase_id
    where ledger.recipient_user_id=v_user_id and ledger.status<>'reversed' and coalesce(purchase.paid_at,ledger.created_at)>=(select min(month_start) from month_axis)
    group by 1
  ), finalized as (
    select make_date(a.reward_year,a.reward_month,1) month_start,sum(a.amount_microyen)::bigint amount_microyen
    from public.market_pageview_reward_allocations a join public.market_pageview_reward_runs r using(reward_year,reward_month)
    where a.recipient_user_id=v_user_id and r.status='finalized' group by 1
    union all
    select make_date(a.reward_year,a.reward_month,1),sum(a.amount_microyen)::bigint from public.creator_play_reward_allocations a join public.market_pageview_reward_runs r using(reward_year,reward_month)
    where a.recipient_user_id=v_user_id and r.status='finalized' group by 1
  ), finalized_monthly as (select month_start,sum(amount_microyen)::bigint amount_microyen from finalized group by 1), live as (
    select axis.month_start,b.amount_yen,coalesce((select count(*) from public.market_pageview_events e where e.status='valid' and e.view_day>=axis.month_start and e.view_day<(axis.month_start+interval '1 month')),0)::numeric*2+
      coalesce((select count(*) from public.creator_play_events e where e.status='valid' and e.app_key='pixfind' and e.creator_user_id is not null and e.play_day>=axis.month_start and e.play_day<(axis.month_start+interval '1 month')),0)::numeric*3 total_points
    from month_axis axis left join public.market_pageview_reward_budgets b on b.reward_year=extract(year from axis.month_start)::integer and b.reward_month=extract(month from axis.month_start)::integer
  ), my_live_points as (
    select live.month_start,coalesce(sum(points),0)::numeric points from live left join lateral (
      select (count(*)::numeric*3) points from public.creator_play_events e where e.status='valid' and e.app_key='pixfind' and e.creator_user_id=v_user_id and e.play_day>=live.month_start and e.play_day<(live.month_start+interval '1 month')
      union all
      select count(*)::numeric*2 from public.market_pageview_events e where e.status='valid' and e.view_day>=live.month_start and e.view_day<(live.month_start+interval '1 month') and exists (
        with recursive related as (select a.id,a.parent_asset_id from public.market_assets a where a.id=e.asset_id union select n.id,n.parent_asset_id from related r join public.market_assets n on n.id=r.parent_asset_id or n.parent_asset_id=r.id)
        select 1 from related join public.market_assets a on a.id=related.id where a.creator_user_id=v_user_id)
    ) contribution on true group by live.month_start
  ), monthly as (
    select axis.month_start,coalesce(ledger.sales_microyen,0)::bigint sales_microyen,coalesce(ledger.lineage_microyen,0)::bigint lineage_microyen,
      coalesce(ledger.sale_count,0)::bigint sale_count,coalesce(ledger.lineage_sale_count,0)::bigint lineage_sale_count,coalesce(finalized.amount_microyen,0)::bigint pageview_microyen,
      case when finalized.month_start is null and live.total_points>0 and coalesce(live.amount_yen,0)>0 then floor(live.amount_yen::numeric*1000000*mine.points/live.total_points)::bigint else 0 end provisional_microyen,
      coalesce(mine.points,0)::numeric provisional_points
    from month_axis axis left join ledger_monthly ledger using(month_start) left join finalized_monthly finalized using(month_start) left join live using(month_start) left join my_live_points mine using(month_start)
  ), balances as (
    select coalesce(sum(amount_microyen) filter(where bucket='available'),0)::bigint available_microyen,coalesce(sum(amount_microyen) filter(where bucket='pending'),0)::bigint pending_microyen from (
      select ledger.amount_microyen-ledger.paid_microyen amount_microyen,case when ledger.status='available' then 'available' else 'pending' end bucket from public.market_royalty_ledger ledger where ledger.recipient_user_id=v_user_id and ledger.status in ('available','pending') and ledger.paid_microyen<ledger.amount_microyen
      union all select allocation.amount_microyen-allocation.paid_microyen,'available' from public.market_pageview_reward_allocations allocation join public.market_pageview_reward_runs run using(reward_year,reward_month) where allocation.recipient_user_id=v_user_id and run.status='finalized' and allocation.paid_microyen<allocation.amount_microyen
      union all select allocation.amount_microyen-allocation.paid_microyen,'available' from public.creator_play_reward_allocations allocation join public.market_pageview_reward_runs run using(reward_year,reward_month) where allocation.recipient_user_id=v_user_id and run.status='finalized' and allocation.paid_microyen<allocation.amount_microyen
    ) balance
  )
  select jsonb_build_object('months',v_months,'currency','jpy','totals',jsonb_build_object('sales_microyen',coalesce(sum(monthly.sales_microyen),0),'lineage_microyen',coalesce(sum(monthly.lineage_microyen),0),'pageview_microyen',coalesce(sum(monthly.pageview_microyen),0),'provisional_microyen',coalesce(sum(monthly.provisional_microyen),0),'provisional_points',coalesce(sum(monthly.provisional_points),0),'sale_count',coalesce(sum(monthly.sale_count),0),'lineage_sale_count',coalesce(sum(monthly.lineage_sale_count),0),'available_microyen',(select available_microyen from balances),'pending_microyen',(select pending_microyen from balances)),'series',coalesce(jsonb_agg(jsonb_build_object('month',to_char(month_start,'YYYY-MM'),'sales_microyen',sales_microyen,'lineage_microyen',lineage_microyen,'pageview_microyen',pageview_microyen,'provisional_microyen',provisional_microyen,'provisional_points',provisional_points,'sale_count',sale_count,'lineage_sale_count',lineage_sale_count) order by month_start),'[]'::jsonb)) into v_result from monthly;
  return v_result;
end;
$$;

revoke all on function public.market_admin_calculate_pageview_rewards_v1(integer,integer,boolean) from public,anon;
grant execute on function public.market_admin_calculate_pageview_rewards_v1(integer,integer,boolean) to authenticated;
revoke all on function public.market_my_reward_dashboard_v1(integer) from public,anon;
grant execute on function public.market_my_reward_dashboard_v1(integer) to authenticated;
