-- A recipient explicitly requests a payout.  The worker must never create a
-- payout merely because an account happens to have reached the minimum.

create table if not exists public.market_payout_requests (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete restrict,
  request_month date not null,
  minimum_yen integer not null default 5000 check (minimum_yen between 1 and 10000000),
  requested_amount_yen integer not null check (requested_amount_yen >= 0),
  provider_fee_yen integer not null default 0 check (provider_fee_yen >= 0),
  transfer_amount_yen integer not null default 0 check (transfer_amount_yen >= 0),
  fee_quote jsonb not null default '{}'::jsonb,
  status text not null default 'requested' check (status in ('requested', 'processing', 'completed', 'failed')),
  payout_batch_id uuid references public.market_payout_batches(id) on delete set null,
  failure_message text not null default '',
  requested_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists market_payout_one_request_per_month
  on public.market_payout_requests(recipient_user_id, request_month)
  where status in ('requested', 'processing', 'completed');
create index if not exists market_payout_requests_pending_idx
  on public.market_payout_requests(status, requested_at);

alter table public.market_payout_requests enable row level security;
create policy market_payout_requests_read_own
on public.market_payout_requests for select to authenticated
using (recipient_user_id = auth.uid());

-- The pricing values below are the current Connect pricing plan selected for
-- PiXiEED.  They are shown before confirmation and retained per request so a
-- later plan change cannot rewrite an historical payout.
create or replace function public.market_stripe_payout_fee_quote_v1(input_gross_yen integer)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_transfer_fee integer;
  v_bank_payout_fee integer;
  v_active_account_fee integer := 200;
  v_total integer;
begin
  if input_gross_yen < 1 then raise exception 'invalid payout amount'; end if;
  v_transfer_fee := ceil(input_gross_yen::numeric * 0.0025)::integer;
  v_bank_payout_fee := ceil(input_gross_yen::numeric * 0.0025)::integer + 250;
  v_total := v_transfer_fee + v_bank_payout_fee + v_active_account_fee;
  return jsonb_build_object(
    'gross_amount_yen', input_gross_yen,
    'transfer_fee_yen', v_transfer_fee,
    'bank_payout_fee_yen', v_bank_payout_fee,
    'active_account_fee_yen', v_active_account_fee,
    'provider_fee_yen', v_total,
    'transfer_amount_yen', greatest(0, input_gross_yen - v_total),
    'reason', 'Stripe ConnectのTransfer、銀行口座への入金、当月の受取口座利用に伴う見込み実費'
  );
end;
$$;

create or replace function public.market_quote_stripe_payout_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_total_microyen bigint;
  v_gross_yen integer;
  v_account_ready boolean;
  v_quote jsonb;
begin
  if v_user_id is null then raise exception 'login required'; end if;
  update public.market_royalty_ledger set status = 'available'
  where recipient_user_id = v_user_id and status = 'pending'
    and available_at <= timezone('utc', now()) and paid_microyen < amount_microyen;
  select coalesce(sum(amount_microyen - paid_microyen), 0)::bigint into v_total_microyen
  from public.market_royalty_ledger
  where recipient_user_id = v_user_id and status = 'available' and paid_microyen < amount_microyen;
  v_gross_yen := floor(v_total_microyen::numeric / 1000000)::integer;
  select exists (
    select 1 from public.market_seller_payout_accounts
    where user_id = v_user_id and provider = 'stripe'
      and onboarding_status = 'verified' and payouts_enabled
  ) into v_account_ready;
  v_quote := case when v_gross_yen > 0 then public.market_stripe_payout_fee_quote_v1(v_gross_yen) else '{}'::jsonb end;
  return v_quote || jsonb_build_object(
    'minimum_yen', 5000, 'eligible', v_gross_yen >= 5000 and v_account_ready,
    'stripe_ready', v_account_ready
  );
end;
$$;

revoke all on function public.market_quote_stripe_payout_v1() from public, anon;
grant execute on function public.market_quote_stripe_payout_v1() to authenticated;

create or replace function public.market_request_stripe_payout_v1(
  input_minimum_yen integer default 5000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_total_microyen bigint;
  v_gross_yen integer;
  v_quote jsonb;
  v_account_id text;
  v_request public.market_payout_requests%rowtype;
  v_month date := date_trunc('month', timezone('Asia/Tokyo', now()))::date;
begin
  if v_user_id is null then raise exception 'login required'; end if;
  if input_minimum_yen < 1 or input_minimum_yen > 10000000 then raise exception 'invalid payout minimum'; end if;

  update public.market_royalty_ledger
  set status = 'available'
  where recipient_user_id = v_user_id
    and status = 'pending'
    and available_at <= timezone('utc', now())
    and paid_microyen < amount_microyen;

  select provider_account_id into v_account_id
  from public.market_seller_payout_accounts
  where user_id = v_user_id
    and provider = 'stripe'
    and onboarding_status = 'verified'
    and payouts_enabled;
  if coalesce(v_account_id, '') = '' then
    raise exception 'Stripeの売上受取設定を完了してください';
  end if;

  select coalesce(sum(amount_microyen - paid_microyen), 0)::bigint into v_total_microyen
  from public.market_royalty_ledger
  where recipient_user_id = v_user_id
    and status = 'available'
    and paid_microyen < amount_microyen;
  if v_total_microyen < input_minimum_yen::bigint * 1000000 then
    raise exception '確定済み残高が出金最低額に達していません';
  end if;
  v_gross_yen := floor(v_total_microyen::numeric / 1000000)::integer;
  v_quote := public.market_stripe_payout_fee_quote_v1(v_gross_yen);
  if coalesce((v_quote ->> 'transfer_amount_yen')::integer, 0) < 1 then
    raise exception 'Stripe費用を差し引くと送金額が残りません';
  end if;

  insert into public.market_payout_requests (
    recipient_user_id, request_month, minimum_yen, requested_amount_yen,
    provider_fee_yen, transfer_amount_yen, fee_quote
  ) values (
    v_user_id, v_month, input_minimum_yen, v_gross_yen,
    (v_quote ->> 'provider_fee_yen')::integer, (v_quote ->> 'transfer_amount_yen')::integer, v_quote
  ) returning * into v_request;

  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (v_user_id, 'stripe_payout_requested', 'market_payout_request', v_request.id::text,
    jsonb_build_object('minimum_yen', input_minimum_yen, 'requested_amount_yen', v_request.requested_amount_yen, 'provider_fee_yen', v_request.provider_fee_yen, 'transfer_amount_yen', v_request.transfer_amount_yen));

  return jsonb_build_object('request_id', v_request.id, 'amount_yen', v_request.transfer_amount_yen, 'gross_amount_yen', v_request.requested_amount_yen, 'provider_fee_yen', v_request.provider_fee_yen, 'fee_quote', v_request.fee_quote);
exception when unique_violation then
  raise exception '今月の出金申請はすでに処理中または完了しています';
end;
$$;

revoke all on function public.market_request_stripe_payout_v1(integer) from public, anon;
grant execute on function public.market_request_stripe_payout_v1(integer) to authenticated;

create or replace function public.market_prepare_requested_stripe_payout_v1(
  input_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.market_payout_requests%rowtype;
  v_batch public.market_payout_batches%rowtype;
  v_account_id text;
  v_total_microyen bigint;
  v_allocation_microyen bigint;
  v_remaining bigint;
  v_ledger record;
  v_allocation bigint;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;

  select * into v_request from public.market_payout_requests
  where id = input_request_id for update;
  if not found then raise exception 'payout request not found'; end if;
  if v_request.status <> 'requested' then raise exception 'payout request is not pending'; end if;

  select provider_account_id into v_account_id
  from public.market_seller_payout_accounts
  where user_id = v_request.recipient_user_id and provider = 'stripe'
    and onboarding_status = 'verified' and payouts_enabled;
  if coalesce(v_account_id, '') = '' then raise exception 'Stripe payout account is not ready'; end if;

  select coalesce(sum(amount_microyen - paid_microyen), 0)::bigint into v_total_microyen
  from public.market_royalty_ledger
  where recipient_user_id = v_request.recipient_user_id and status = 'available'
    and paid_microyen < amount_microyen;
  if v_total_microyen < v_request.requested_amount_yen::bigint * 1000000 then
    raise exception 'payout balance is below minimum';
  end if;

  v_allocation_microyen := v_request.requested_amount_yen::bigint * 1000000;
  insert into public.market_payout_batches (
    recipient_user_id, provider_account_id, amount_yen, amount_microyen
  ) values (
    v_request.recipient_user_id, v_account_id,
    v_request.transfer_amount_yen, v_request.transfer_amount_yen::bigint * 1000000
  ) returning * into v_batch;

  v_remaining := v_allocation_microyen;
  for v_ledger in
    select id, purchase_id, amount_microyen, paid_microyen
    from public.market_royalty_ledger
    where recipient_user_id = v_request.recipient_user_id and status = 'available'
      and paid_microyen < amount_microyen
    order by available_at, created_at, id for update
  loop
    exit when v_remaining <= 0;
    v_allocation := least(v_remaining, v_ledger.amount_microyen - v_ledger.paid_microyen);
    insert into public.market_payout_items(batch_id, royalty_ledger_id, purchase_id, amount_microyen)
    values (v_batch.id, v_ledger.id, v_ledger.purchase_id, v_allocation);
    v_remaining := v_remaining - v_allocation;
  end loop;
  if v_remaining <> 0 then raise exception 'payout allocation did not balance'; end if;

  update public.market_payout_requests
  set status = 'processing', payout_batch_id = v_batch.id, updated_at = timezone('utc', now())
  where id = v_request.id;

  return jsonb_build_object('batch_id', v_batch.id, 'provider_account_id', v_account_id,
    'amount_yen', v_batch.amount_yen, 'gross_amount_yen', v_request.requested_amount_yen,
    'provider_fee_yen', v_request.provider_fee_yen, 'fee_quote', v_request.fee_quote, 'currency', v_batch.currency);
end;
$$;

revoke all on function public.market_prepare_requested_stripe_payout_v1(uuid) from public, anon, authenticated;
grant execute on function public.market_prepare_requested_stripe_payout_v1(uuid) to service_role;

create or replace function public.market_complete_requested_stripe_payout_v1(
  input_request_id uuid,
  input_failure_message text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if btrim(coalesce(input_failure_message, '')) <> '' then
    update public.market_payout_batches batch
    set status = 'failed',
        failure_message = btrim(input_failure_message),
        updated_at = timezone('utc', now())
    from public.market_payout_requests request
    where request.id = input_request_id
      and request.payout_batch_id = batch.id
      and batch.status = 'prepared';
  end if;
  update public.market_payout_requests
  set status = case when btrim(coalesce(input_failure_message, '')) = '' then 'completed' else 'failed' end,
      failure_message = btrim(coalesce(input_failure_message, '')),
      processed_at = timezone('utc', now()), updated_at = timezone('utc', now())
  where id = input_request_id;
end;
$$;

revoke all on function public.market_complete_requested_stripe_payout_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.market_complete_requested_stripe_payout_v1(uuid, text) to service_role;

-- A payout batch may only be created from a creator-confirmed request. The
-- scheduled worker is still allowed to resume an already prepared batch after
-- a transient function failure, but must never select a new recipient itself.
create or replace function public.market_next_stripe_payout_batch_v1(
  input_minimum_yen integer default 5000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_batch public.market_payout_batches%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if input_minimum_yen < 1 or input_minimum_yen > 10000000 then
    raise exception 'invalid payout minimum';
  end if;

  select * into v_batch
  from public.market_payout_batches
  where status = 'prepared'
  order by prepared_at
  limit 1
  for update skip locked;
  if not found then return null; end if;

  return jsonb_build_object(
    'batch_id', v_batch.id,
    'recipient_user_id', v_batch.recipient_user_id,
    'provider_account_id', v_batch.provider_account_id,
    'amount_yen', v_batch.amount_yen,
    'currency', v_batch.currency
  );
end;
$$;
