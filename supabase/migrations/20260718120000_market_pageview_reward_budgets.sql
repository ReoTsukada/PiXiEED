-- Administrator-managed monthly page-view reward budgets.
-- This stores funding plans only. It does not count views, calculate shares,
-- create payout ledgers, or move money through Stripe.

create table if not exists public.market_pageview_reward_budgets (
  reward_year integer not null check (reward_year between 2025 and 2100),
  reward_month integer not null check (reward_month between 1 and 12),
  amount_yen bigint not null default 0 check (amount_yen between 0 and 1000000000),
  currency text not null default 'JPY' check (currency = 'JPY'),
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (reward_year, reward_month)
);

alter table public.market_pageview_reward_budgets enable row level security;
revoke all on public.market_pageview_reward_budgets from public, anon, authenticated;

create or replace function public.market_admin_get_pageview_reward_year_v1(
  input_year integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.market_current_user_is_admin() then
    raise exception 'admin permission required';
  end if;
  if input_year is null or input_year < 2025 or input_year > 2100 then
    raise exception 'reward year must be between 2025 and 2100';
  end if;

  select jsonb_build_object(
    'year', input_year,
    'currency', 'JPY',
    'annual_total_yen', coalesce(sum(coalesce(budgets.amount_yen, 0)), 0),
    'months', jsonb_agg(
      jsonb_build_object(
        'month', months.month_number,
        'amount_yen', coalesce(budgets.amount_yen, 0),
        'updated_at', budgets.updated_at
      ) order by months.month_number
    )
  ) into v_result
  from generate_series(1, 12) as months(month_number)
  left join public.market_pageview_reward_budgets as budgets
    on budgets.reward_year = input_year
   and budgets.reward_month = months.month_number;

  return v_result;
end;
$$;

create or replace function public.market_admin_set_pageview_reward_year_v1(
  input_year integer,
  input_monthly_amounts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_month integer;
  v_amount bigint;
  v_annual_total bigint := 0;
begin
  if not public.market_current_user_is_admin() then
    raise exception 'admin permission required';
  end if;
  if input_year is null or input_year < 2025 or input_year > 2100 then
    raise exception 'reward year must be between 2025 and 2100';
  end if;
  if input_monthly_amounts is null or jsonb_typeof(input_monthly_amounts) <> 'object' then
    raise exception 'all 12 monthly reward amounts are required';
  end if;
  if (select count(*) from jsonb_object_keys(input_monthly_amounts)) <> 12 then
    raise exception 'all 12 monthly reward amounts are required';
  end if;
  if exists (
    select 1
    from jsonb_each_text(input_monthly_amounts) as entries(month_key, amount_value)
    where entries.month_key !~ '^([1-9]|1[0-2])$'
       or case
         when entries.amount_value ~ '^(0|[1-9][0-9]*)$'
           then entries.amount_value::numeric > 1000000000
         else true
       end
  ) then
    raise exception 'monthly reward amount must be an integer between 0 and 1000000000 yen';
  end if;
  if exists (
    select 1
    from generate_series(1, 12) as months(month_number)
    where not (input_monthly_amounts ? months.month_number::text)
  ) then
    raise exception 'all 12 monthly reward amounts are required';
  end if;

  for v_month in 1..12 loop
    v_amount := (input_monthly_amounts ->> v_month::text)::bigint;
    v_annual_total := v_annual_total + v_amount;

    insert into public.market_pageview_reward_budgets (
      reward_year,
      reward_month,
      amount_yen,
      currency,
      updated_by,
      created_at,
      updated_at
    ) values (
      input_year,
      v_month,
      v_amount,
      'JPY',
      auth.uid(),
      v_now,
      v_now
    )
    on conflict (reward_year, reward_month) do update set
      amount_yen = excluded.amount_yen,
      currency = excluded.currency,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;
  end loop;

  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (
    auth.uid(),
    'pageview_reward_budget_year_updated',
    'market_pageview_reward_budget_year',
    input_year::text,
    jsonb_build_object(
      'year', input_year,
      'currency', 'JPY',
      'monthly_amounts', input_monthly_amounts,
      'annual_total_yen', v_annual_total,
      'updated_at', v_now
    )
  );

  return public.market_admin_get_pageview_reward_year_v1(input_year);
end;
$$;

revoke all on function public.market_admin_get_pageview_reward_year_v1(integer)
  from public, anon, authenticated;
revoke all on function public.market_admin_set_pageview_reward_year_v1(integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.market_admin_get_pageview_reward_year_v1(integer)
  to authenticated;
grant execute on function public.market_admin_set_pageview_reward_year_v1(integer, jsonb)
  to authenticated;
