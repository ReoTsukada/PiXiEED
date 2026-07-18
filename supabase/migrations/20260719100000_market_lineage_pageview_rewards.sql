-- Valid product views fund the viewed work's direct lineage.
-- The monthly pool is divided by valid views, then equally by lineage
-- generation, then equally between eligible works in the same generation.

create table if not exists public.market_pageview_events (
  id bigint generated always as identity primary key,
  asset_id uuid not null references public.market_assets(id) on delete restrict,
  series_id uuid not null references public.market_asset_series(id) on delete restrict,
  view_day date not null,
  viewer_key_hash text not null check (viewer_key_hash ~ '^[0-9a-f]{64}$'),
  viewer_user_id uuid references auth.users(id) on delete set null,
  dwell_seconds smallint not null check (dwell_seconds between 10 and 3600),
  status text not null default 'valid' check (status in ('valid', 'rejected')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (asset_id, view_day, viewer_key_hash)
);

create index if not exists market_pageview_events_month_idx
  on public.market_pageview_events(view_day, status, asset_id);
create index if not exists market_pageview_events_viewer_day_idx
  on public.market_pageview_events(viewer_key_hash, view_day);

alter table public.market_pageview_events enable row level security;
revoke all on public.market_pageview_events from public, anon, authenticated;

create table if not exists public.market_pageview_reward_runs (
  reward_year integer not null check (reward_year between 2025 and 2100),
  reward_month integer not null check (reward_month between 1 and 12),
  budget_yen bigint not null check (budget_yen >= 0),
  valid_view_count bigint not null default 0 check (valid_view_count >= 0),
  allocated_microyen bigint not null default 0 check (allocated_microyen >= 0),
  remainder_microyen bigint not null default 0 check (remainder_microyen >= 0),
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  calculated_at timestamptz not null default timezone('utc', now()),
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id) on delete restrict,
  primary key (reward_year, reward_month)
);

create table if not exists public.market_pageview_reward_allocations (
  reward_year integer not null,
  reward_month integer not null,
  source_asset_id uuid not null references public.market_assets(id) on delete restrict,
  recipient_asset_id uuid not null references public.market_assets(id) on delete restrict,
  recipient_user_id uuid not null references auth.users(id) on delete restrict,
  source_view_count bigint not null check (source_view_count > 0),
  generation_index integer not null check (generation_index >= 0),
  generation_count integer not null check (generation_count > 0),
  works_in_generation integer not null check (works_in_generation > 0),
  amount_microyen bigint not null check (amount_microyen >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (reward_year, reward_month, source_asset_id, recipient_asset_id),
  foreign key (reward_year, reward_month)
    references public.market_pageview_reward_runs(reward_year, reward_month) on delete cascade
);

create index if not exists market_pageview_reward_allocations_recipient_idx
  on public.market_pageview_reward_allocations(recipient_user_id, reward_year desc, reward_month desc);

alter table public.market_pageview_reward_runs enable row level security;
alter table public.market_pageview_reward_allocations enable row level security;
revoke all on public.market_pageview_reward_runs from public, anon, authenticated;
revoke all on public.market_pageview_reward_allocations from public, anon, authenticated;

create or replace function public.market_record_valid_pageview_v1(
  input_asset_id uuid,
  input_viewer_key_hash text,
  input_dwell_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset public.market_assets%rowtype;
  v_today date := (timezone('utc', now()))::date;
  v_inserted_count integer := 0;
begin
  if coalesce(lower(input_viewer_key_hash), '') !~ '^[0-9a-f]{64}$' then
    raise exception 'valid anonymous viewer key is required';
  end if;
  if input_dwell_seconds is null or input_dwell_seconds < 10 or input_dwell_seconds > 3600 then
    raise exception 'visible dwell time must be between 10 and 3600 seconds';
  end if;

  select * into v_asset
  from public.market_assets
  where id = input_asset_id and status = 'published';
  if not found then raise exception 'published asset not found'; end if;

  if auth.uid() is not null and auth.uid() = v_asset.creator_user_id then
    return jsonb_build_object('accepted', false, 'reason', 'creator-self-view');
  end if;
  if (
    select count(*) from public.market_pageview_events
    where viewer_key_hash = lower(input_viewer_key_hash) and view_day = v_today
  ) >= 100 then
    return jsonb_build_object('accepted', false, 'reason', 'daily-view-limit');
  end if;

  insert into public.market_pageview_events(
    asset_id, series_id, view_day, viewer_key_hash, viewer_user_id, dwell_seconds, status
  ) values (
    v_asset.id, v_asset.series_id, v_today, lower(input_viewer_key_hash), auth.uid(), input_dwell_seconds, 'valid'
  ) on conflict (asset_id, view_day, viewer_key_hash) do nothing;
  get diagnostics v_inserted_count = row_count;

  return jsonb_build_object(
    'accepted', v_inserted_count = 1,
    'reason', case when v_inserted_count = 1 then 'recorded' else 'already-recorded-today' end
  );
end;
$$;

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
  v_start date;
  v_end date;
  v_budget_yen bigint;
  v_total_views bigint;
  v_allocated bigint;
  v_budget_microyen bigint;
  v_existing_status text;
  v_now timestamptz := timezone('utc', now());
begin
  if not public.market_current_user_is_admin() then raise exception 'admin permission required'; end if;
  if input_year is null or input_year < 2025 or input_year > 2100
     or input_month is null or input_month < 1 or input_month > 12 then
    raise exception 'valid reward year and month are required';
  end if;
  v_start := make_date(input_year, input_month, 1);
  v_end := (v_start + interval '1 month')::date;
  if input_finalize and v_end > (timezone('utc', now()))::date then
    raise exception 'the reward month can be finalized only after it ends';
  end if;

  select amount_yen into v_budget_yen
  from public.market_pageview_reward_budgets
  where reward_year = input_year and reward_month = input_month
  for share;
  if not found then raise exception 'monthly reward budget is not configured'; end if;

  select status into v_existing_status
  from public.market_pageview_reward_runs
  where reward_year = input_year and reward_month = input_month
  for update;
  if v_existing_status = 'finalized' then raise exception 'pageview reward month is already finalized'; end if;

  select count(*) into v_total_views
  from public.market_pageview_events
  where status = 'valid' and view_day >= v_start and view_day < v_end;
  v_budget_microyen := v_budget_yen * 1000000;

  insert into public.market_pageview_reward_runs(
    reward_year, reward_month, budget_yen, valid_view_count,
    allocated_microyen, remainder_microyen, status, calculated_at
  ) values (
    input_year, input_month, v_budget_yen, v_total_views,
    0, v_budget_microyen, 'draft', v_now
  ) on conflict (reward_year, reward_month) do update set
    budget_yen = excluded.budget_yen,
    valid_view_count = excluded.valid_view_count,
    allocated_microyen = 0,
    remainder_microyen = excluded.remainder_microyen,
    status = 'draft',
    calculated_at = excluded.calculated_at,
    finalized_at = null,
    finalized_by = null;

  delete from public.market_pageview_reward_allocations
  where reward_year = input_year and reward_month = input_month;

  if v_total_views > 0 and v_budget_microyen > 0 then
    with recursive
    source_views as (
      select asset_id as source_asset_id, count(*)::bigint as view_count
      from public.market_pageview_events
      where status = 'valid' and view_day >= v_start and view_day < v_end
      group by asset_id
    ),
    published_tree as (
      select asset.id, asset.parent_asset_id, asset.creator_user_id, 0 as generation_index
      from public.market_assets asset
      where asset.parent_asset_id is null
        and asset.status = 'published' and asset.published_at < v_end
      union all
      select child.id, child.parent_asset_id, child.creator_user_id, tree.generation_index + 1
      from published_tree tree
      join public.market_assets child on child.parent_asset_id = tree.id
      where child.status = 'published' and child.published_at < v_end
    ),
    ancestors as (
      select views.source_asset_id, tree.id as recipient_asset_id
      from source_views views join published_tree tree on tree.id = views.source_asset_id
      union all
      select lineage.source_asset_id, parent.id
      from ancestors lineage
      join public.market_assets current_asset on current_asset.id = lineage.recipient_asset_id
      join published_tree parent on parent.id = current_asset.parent_asset_id
    ),
    descendants as (
      select views.source_asset_id, tree.id as recipient_asset_id
      from source_views views join published_tree tree on tree.id = views.source_asset_id
      union all
      select lineage.source_asset_id, child.id
      from descendants lineage
      join published_tree child on child.parent_asset_id = lineage.recipient_asset_id
    ),
    eligible as (
      select source_asset_id, recipient_asset_id from ancestors
      union
      select source_asset_id, recipient_asset_id from descendants
    ),
    eligible_with_generation as (
      select eligible.source_asset_id, eligible.recipient_asset_id,
             recipient.creator_user_id as recipient_user_id,
             recipient.generation_index,
             views.view_count
      from eligible
      join published_tree recipient on recipient.id = eligible.recipient_asset_id
      join source_views views on views.source_asset_id = eligible.source_asset_id
    ),
    generation_counts as (
      select source_asset_id, count(distinct generation_index)::integer as generation_count
      from eligible_with_generation group by source_asset_id
    ),
    peer_counts as (
      select source_asset_id, generation_index, count(*)::integer as works_in_generation
      from eligible_with_generation group by source_asset_id, generation_index
    )
    insert into public.market_pageview_reward_allocations(
      reward_year, reward_month, source_asset_id, recipient_asset_id, recipient_user_id,
      source_view_count, generation_index, generation_count, works_in_generation, amount_microyen
    )
    select input_year, input_month, eligible.source_asset_id, eligible.recipient_asset_id,
           eligible.recipient_user_id, eligible.view_count, eligible.generation_index,
           generations.generation_count, peers.works_in_generation,
           floor(
             v_budget_microyen::numeric * eligible.view_count::numeric
             / v_total_views::numeric
             / generations.generation_count::numeric
             / peers.works_in_generation::numeric
           )::bigint
    from eligible_with_generation eligible
    join generation_counts generations using (source_asset_id)
    join peer_counts peers using (source_asset_id, generation_index);
  end if;

  select coalesce(sum(amount_microyen), 0) into v_allocated
  from public.market_pageview_reward_allocations
  where reward_year = input_year and reward_month = input_month;

  update public.market_pageview_reward_runs
  set allocated_microyen = v_allocated,
      remainder_microyen = greatest(0, v_budget_microyen - v_allocated),
      status = case when input_finalize then 'finalized' else 'draft' end,
      finalized_at = case when input_finalize then v_now else null end,
      finalized_by = case when input_finalize then auth.uid() else null end
  where reward_year = input_year and reward_month = input_month;

  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (
    auth.uid(),
    case when input_finalize then 'pageview_rewards_finalized' else 'pageview_rewards_calculated' end,
    'market_pageview_reward_month',
    format('%s-%s', input_year, lpad(input_month::text, 2, '0')),
    jsonb_build_object(
      'budget_yen', v_budget_yen, 'valid_view_count', v_total_views,
      'allocated_microyen', v_allocated,
      'remainder_microyen', greatest(0, v_budget_microyen - v_allocated)
    )
  );

  return jsonb_build_object(
    'year', input_year, 'month', input_month,
    'status', case when input_finalize then 'finalized' else 'draft' end,
    'budget_yen', v_budget_yen, 'valid_view_count', v_total_views,
    'allocated_microyen', v_allocated,
    'remainder_microyen', greatest(0, v_budget_microyen - v_allocated)
  );
end;
$$;

create or replace function public.market_my_pageview_rewards_v1()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with monthly as (
    select allocation.reward_year, allocation.reward_month,
           sum(allocation.amount_microyen)::bigint as amount_microyen
    from public.market_pageview_reward_allocations allocation
    join public.market_pageview_reward_runs run
      using (reward_year, reward_month)
    where allocation.recipient_user_id = auth.uid() and run.status = 'finalized'
    group by allocation.reward_year, allocation.reward_month
  ), recent as (
    select * from monthly
    order by reward_year desc, reward_month desc
    limit 24
  )
  select jsonb_build_object(
    'total_microyen', coalesce((select sum(amount_microyen) from monthly), 0),
    'months', coalesce((
      select jsonb_agg(jsonb_build_object(
        'year', reward_year, 'month', reward_month, 'amount_microyen', amount_microyen
      ) order by reward_year desc, reward_month desc) from recent
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.market_record_valid_pageview_v1(uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.market_admin_calculate_pageview_rewards_v1(integer, integer, boolean)
  from public, anon, authenticated;
revoke all on function public.market_my_pageview_rewards_v1()
  from public, anon, authenticated;
grant execute on function public.market_record_valid_pageview_v1(uuid, text, integer)
  to anon, authenticated;
grant execute on function public.market_admin_calculate_pageview_rewards_v1(integer, integer, boolean)
  to authenticated;
grant execute on function public.market_my_pageview_rewards_v1()
  to authenticated;
