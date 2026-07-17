-- Stripe-only payment and seller payout foundation for the inheritance market.
-- The retired fixed-product Stripe integration is intentionally not reused.

alter table public.market_seller_payout_accounts
  add column if not exists details_submitted boolean not null default false,
  add column if not exists charges_enabled boolean not null default false,
  add column if not exists requirements_due jsonb not null default '[]'::jsonb,
  add column if not exists disabled_reason text not null default '',
  add column if not exists last_synced_at timestamptz;

alter table public.market_seller_payout_accounts
  drop constraint if exists market_seller_payout_accounts_provider_check;
alter table public.market_seller_payout_accounts
  add constraint market_seller_payout_accounts_provider_check
  check (provider = 'stripe');
alter table public.market_seller_payout_accounts
  drop constraint if exists market_seller_payout_requirements_shape;
alter table public.market_seller_payout_accounts
  add constraint market_seller_payout_requirements_shape
  check (jsonb_typeof(requirements_due) = 'array');

alter table public.market_purchases
  add column if not exists provider_checkout_session_id text,
  add column if not exists provider_charge_id text,
  add column if not exists provider_refund_id text,
  add column if not exists provider_last_event_id text,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.market_assets
  drop constraint if exists market_assets_stripe_charge_range;
alter table public.market_assets
  add constraint market_assets_stripe_charge_range
  check (sale_price_yen = 0 or sale_price_yen between 50 and 99999999);

create unique index if not exists market_purchases_checkout_session_unique
  on public.market_purchases(provider_checkout_session_id)
  where provider_checkout_session_id is not null;
create unique index if not exists market_purchases_charge_unique
  on public.market_purchases(provider_charge_id)
  where provider_charge_id is not null;
create unique index if not exists market_purchases_one_paid_per_buyer_asset
  on public.market_purchases(buyer_user_id, asset_id)
  where status = 'paid';

create table if not exists public.market_payment_events (
  event_id text primary key,
  provider text not null default 'stripe' check (provider = 'stripe'),
  event_type text not null,
  object_id text not null default '',
  processing_status text not null default 'processing'
    check (processing_status in ('processing', 'processed', 'failed', 'ignored')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  error_message text not null default '',
  received_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.market_payment_events enable row level security;

create or replace function public.market_platform_fee_yen(input_gross_amount_yen integer)
returns integer
language sql
immutable
strict
as $$
  select floor(
    input_gross_amount_yen::numeric *
    case
      when input_gross_amount_yen >= 50000 then 0.01
      when input_gross_amount_yen >= 40000 then 0.02
      when input_gross_amount_yen >= 30000 then 0.03
      when input_gross_amount_yen >= 20000 then 0.04
      when input_gross_amount_yen >= 10000 then 0.05
      when input_gross_amount_yen >= 5000 then 0.06
      when input_gross_amount_yen >= 3000 then 0.07
      when input_gross_amount_yen >= 2000 then 0.08
      when input_gross_amount_yen >= 1000 then 0.09
      else 0.10
    end
  )::integer;
$$;

revoke all on function public.market_platform_fee_yen(integer)
  from public, anon, authenticated;
grant execute on function public.market_platform_fee_yen(integer)
  to service_role;

-- Stripe account.updated is the authoritative payout-readiness signal. Local
-- contact details and TOTP remain required before a seller can be activated.
create or replace function public.market_sync_stripe_account_v1(
  input_user_id uuid,
  input_account_id text,
  input_details_submitted boolean,
  input_charges_enabled boolean,
  input_payouts_enabled boolean,
  input_requirements_due jsonb default '[]'::jsonb,
  input_disabled_reason text default ''
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ready boolean := coalesce(input_details_submitted, false)
    and coalesce(input_payouts_enabled, false)
    and coalesce(jsonb_array_length(coalesce(input_requirements_due, '[]'::jsonb)), 0) = 0
    and nullif(btrim(coalesce(input_disabled_reason, '')), '') is null;
  v_status text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;
  if nullif(btrim(coalesce(input_account_id, '')), '') is null then
    raise exception 'stripe account id required';
  end if;
  if jsonb_typeof(coalesce(input_requirements_due, '[]'::jsonb)) <> 'array' then
    raise exception 'requirements must be an array';
  end if;

  v_status := case
    when v_ready then 'verified'
    when nullif(btrim(coalesce(input_disabled_reason, '')), '') is not null then 'restricted'
    when coalesce(input_details_submitted, false) then 'restricted'
    else 'pending'
  end;

  insert into public.market_seller_payout_accounts (
    user_id, provider, provider_account_id, onboarding_status,
    details_submitted, charges_enabled, payouts_enabled,
    requirements_due, disabled_reason, last_synced_at
  ) values (
    input_user_id, 'stripe', btrim(input_account_id), v_status,
    coalesce(input_details_submitted, false), coalesce(input_charges_enabled, false),
    coalesce(input_payouts_enabled, false), coalesce(input_requirements_due, '[]'::jsonb),
    left(coalesce(input_disabled_reason, ''), 500), timezone('utc', now())
  )
  on conflict (user_id) do update set
    provider = 'stripe',
    provider_account_id = excluded.provider_account_id,
    onboarding_status = excluded.onboarding_status,
    details_submitted = excluded.details_submitted,
    charges_enabled = excluded.charges_enabled,
    payouts_enabled = excluded.payouts_enabled,
    requirements_due = excluded.requirements_due,
    disabled_reason = excluded.disabled_reason,
    last_synced_at = excluded.last_synced_at,
    updated_at = timezone('utc', now());

  update public.market_seller_profiles
  set identity_status = case when v_ready then 'verified' else identity_status end,
      seller_status = case
        when seller_status = 'disabled' then seller_status
        when v_ready
          and terms_accepted_at is not null
          and contact_registered_at is not null
          and mfa_confirmed_at is not null then 'verified'
        when v_status = 'restricted' and seller_status = 'verified' then 'restricted'
        else seller_status
      end,
      verified_at = case when v_ready then coalesce(verified_at, timezone('utc', now())) else verified_at end,
      restricted_reason = case
        when v_ready then ''
        when v_status = 'restricted' then left(coalesce(input_disabled_reason, 'Stripeの確認事項が残っています'), 1000)
        else restricted_reason
      end,
      updated_at = timezone('utc', now())
  where user_id = input_user_id;

  update public.market_assets
  set seller_identity_verified = v_ready,
      updated_at = timezone('utc', now())
  where creator_user_id = input_user_id
    and seller_identity_verified is distinct from v_ready;

  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (
    null,
    'stripe_account_synced',
    'market_seller_payout_account',
    input_user_id::text,
    jsonb_build_object(
      'stripe_account_id', btrim(input_account_id),
      'onboarding_status', v_status,
      'details_submitted', coalesce(input_details_submitted, false),
      'payouts_enabled', coalesce(input_payouts_enabled, false),
      'requirements_due', coalesce(input_requirements_due, '[]'::jsonb)
    )
  );
  return v_status;
end;
$$;

revoke all on function public.market_sync_stripe_account_v1(uuid, text, boolean, boolean, boolean, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.market_sync_stripe_account_v1(uuid, text, boolean, boolean, boolean, jsonb, text)
  to service_role;

create or replace function public.market_current_user_can_sell()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.market_current_user_has_confirmed_identity()
    and public.market_current_session_has_mfa()
    and exists (
      select 1
      from public.market_seller_profiles seller
      join public.market_seller_payout_accounts payout on payout.user_id = seller.user_id
      where seller.user_id = auth.uid()
        and seller.seller_status = 'verified'
        and seller.identity_status = 'verified'
        and seller.terms_accepted_at is not null
        and seller.contact_registered_at is not null
        and seller.mfa_confirmed_at is not null
        and payout.provider = 'stripe'
        and payout.onboarding_status = 'verified'
        and payout.details_submitted
        and payout.payouts_enabled
    );
$$;

revoke all on function public.market_current_user_can_sell()
  from public, anon, authenticated;
grant execute on function public.market_current_user_can_sell()
  to authenticated;

create or replace function public.market_bind_stripe_checkout_v1(
  input_purchase_id uuid,
  input_buyer_user_id uuid,
  input_checkout_session_id text,
  input_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;
  update public.market_purchases
  set payment_provider = 'stripe',
      provider_checkout_session_id = btrim(input_checkout_session_id),
      expires_at = least(input_expires_at, timezone('utc', now()) + interval '24 hours'),
      updated_at = timezone('utc', now())
  where id = input_purchase_id
    and buyer_user_id = input_buyer_user_id
    and status = 'pending'
    and (provider_checkout_session_id is null
      or provider_checkout_session_id = btrim(input_checkout_session_id));
  if not found then
    raise exception 'pending purchase could not be bound to checkout';
  end if;
end;
$$;

revoke all on function public.market_bind_stripe_checkout_v1(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.market_bind_stripe_checkout_v1(uuid, uuid, text, timestamptz)
  to service_role;

-- Royalty value is held for 30 days. A separate payout job may release and
-- transfer it only after refund and dispute risk has passed.
create or replace function public.market_create_royalty_ledger(input_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.market_purchases%rowtype;
begin
  select * into v_purchase
  from public.market_purchases
  where id = input_purchase_id
  for update;
  if not found or v_purchase.status <> 'paid' then
    raise exception 'a paid market purchase is required';
  end if;

  with recursive lineage as (
    select id, parent_asset_id, creator_user_id, 0 as depth
    from public.market_assets where id = v_purchase.asset_id
    union all
    select parent.id, parent.parent_asset_id, parent.creator_user_id, lineage.depth + 1
    from lineage
    join public.market_assets parent on parent.id = lineage.parent_asset_id
    where lineage.depth < 60
  ), shares as (
    select creator_user_id as recipient_user_id,
      case
        when depth = 0 then 10000 - coalesce(sum(
          case when depth > 0 then floor(1000.0 / power(2, depth - 1))::integer else 0 end
        ) over (), 0)
        else floor(1000.0 / power(2, depth - 1))::integer
      end as royalty_basis_points,
      depth
    from lineage
  ), combined as (
    select recipient_user_id,
      min(depth) as lineage_depth,
      sum(royalty_basis_points)::integer as royalty_basis_points
    from shares
    group by recipient_user_id
  )
  insert into public.market_royalty_ledger (
    purchase_id, asset_id, recipient_user_id, lineage_depth,
    royalty_basis_points, amount_microyen, status, available_at
  )
  select v_purchase.id, v_purchase.asset_id, recipient_user_id, lineage_depth,
    royalty_basis_points,
    v_purchase.distributable_amount_yen::bigint * royalty_basis_points::bigint * 100,
    'pending', timezone('utc', now()) + interval '30 days'
  from combined
  on conflict (purchase_id, recipient_user_id) do nothing;
end;
$$;

revoke all on function public.market_create_royalty_ledger(uuid)
  from public, anon, authenticated;
grant execute on function public.market_create_royalty_ledger(uuid)
  to service_role;

create or replace function public.market_complete_stripe_purchase_v1(
  input_purchase_id uuid,
  input_checkout_session_id text,
  input_payment_intent_id text,
  input_charge_id text,
  input_gross_amount_yen integer,
  input_processor_fee_yen integer,
  input_event_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.market_purchases%rowtype;
  v_platform_fee integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;
  select * into v_purchase
  from public.market_purchases
  where id = input_purchase_id
  for update;

  if not found
     or v_purchase.payment_provider <> 'stripe'
     or v_purchase.provider_checkout_session_id <> btrim(input_checkout_session_id) then
    raise exception 'stripe checkout does not match purchase';
  end if;
  if v_purchase.gross_amount_yen <> input_gross_amount_yen
     or input_gross_amount_yen <= 0 then
    raise exception 'stripe amount does not match purchase';
  end if;
  if input_processor_fee_yen < 0 or input_processor_fee_yen > input_gross_amount_yen then
    raise exception 'invalid stripe processing fee';
  end if;
  if v_purchase.status = 'paid' then
    return v_purchase.id;
  end if;
  if v_purchase.status <> 'pending' then
    raise exception 'purchase is not payable';
  end if;

  v_platform_fee := public.market_platform_fee_yen(input_gross_amount_yen);
  if input_processor_fee_yen + v_platform_fee > input_gross_amount_yen then
    raise exception 'fees exceed purchase amount';
  end if;

  update public.market_purchases
  set status = 'paid',
      payment_provider = 'stripe',
      provider_payment_id = btrim(input_payment_intent_id),
      provider_charge_id = nullif(btrim(coalesce(input_charge_id, '')), ''),
      provider_last_event_id = btrim(input_event_id),
      processor_fee_yen = input_processor_fee_yen,
      platform_fee_yen = v_platform_fee,
      distributable_amount_yen = input_gross_amount_yen - input_processor_fee_yen - v_platform_fee,
      paid_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = v_purchase.id;

  perform public.market_materialize_paid_purchase_v1(v_purchase.id);
  return v_purchase.id;
end;
$$;

revoke all on function public.market_complete_stripe_purchase_v1(uuid, text, text, text, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.market_complete_stripe_purchase_v1(uuid, text, text, text, integer, integer, text)
  to service_role;

-- A zero-yen listing has no payment provider transaction. It still follows
-- the same service-only right materialization path and cannot be self-granted
-- by a browser client.
create or replace function public.market_complete_free_purchase_v1(
  input_purchase_id uuid,
  input_buyer_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_purchase public.market_purchases%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;
  select * into v_purchase
  from public.market_purchases
  where id = input_purchase_id
  for update;
  if not found
     or v_purchase.buyer_user_id <> input_buyer_user_id
     or v_purchase.status <> 'pending'
     or v_purchase.gross_amount_yen <> 0 then
    raise exception 'valid free purchase required';
  end if;
  update public.market_purchases
  set status = 'paid',
      payment_provider = 'internal-free',
      provider_payment_id = 'free:' || v_purchase.id::text,
      processor_fee_yen = 0,
      platform_fee_yen = 0,
      distributable_amount_yen = 0,
      paid_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = v_purchase.id;
  perform public.market_materialize_paid_purchase_v1(v_purchase.id);
  return v_purchase.id;
end;
$$;

revoke all on function public.market_complete_free_purchase_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.market_complete_free_purchase_v1(uuid, uuid)
  to service_role;

create or replace function public.market_reverse_stripe_purchase_v1(
  input_charge_id text,
  input_event_id text,
  input_reason text,
  input_refund_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.market_purchases%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;
  select * into v_purchase
  from public.market_purchases
  where provider_charge_id = btrim(input_charge_id)
  for update;
  if not found then
    raise exception 'stripe charge purchase not found';
  end if;

  update public.market_purchases
  set status = case when input_reason = 'refund' then 'refunded' else 'disputed' end,
      provider_refund_id = coalesce(nullif(btrim(coalesce(input_refund_id, '')), ''), provider_refund_id),
      provider_last_event_id = btrim(input_event_id),
      refunded_at = case when input_reason = 'refund' then timezone('utc', now()) else refunded_at end,
      updated_at = timezone('utc', now())
  where id = v_purchase.id;

  update public.market_royalty_ledger
  set status = 'reversed', reversed_at = timezone('utc', now())
  where purchase_id = v_purchase.id and status <> 'reversed';

  update public.market_derivative_licenses
  set status = 'revoked', revoked_at = timezone('utc', now())
  where purchase_id = v_purchase.id and status in ('active', 'used');

  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (
    null, 'stripe_purchase_reversed', 'market_purchase', v_purchase.id::text,
    jsonb_build_object('reason', input_reason, 'event_id', input_event_id, 'charge_id', input_charge_id)
  );
  return v_purchase.id;
end;
$$;

revoke all on function public.market_reverse_stripe_purchase_v1(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.market_reverse_stripe_purchase_v1(text, text, text, text)
  to service_role;

create or replace function public.market_restore_stripe_purchase_v1(
  input_charge_id text,
  input_event_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.market_purchases%rowtype;
  v_derivative_allowed boolean;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;
  select * into v_purchase
  from public.market_purchases
  where provider_charge_id = btrim(input_charge_id)
  for update;
  if not found or v_purchase.status <> 'disputed' then
    raise exception 'disputed stripe purchase not found';
  end if;

  update public.market_purchases
  set status = 'paid', provider_last_event_id = btrim(input_event_id), updated_at = timezone('utc', now())
  where id = v_purchase.id;

  update public.market_royalty_ledger
  set status = 'pending',
      available_at = timezone('utc', now()) + interval '30 days',
      reversed_at = null
  where purchase_id = v_purchase.id and status = 'reversed';

  select series.derivative_sales_allowed into v_derivative_allowed
  from public.market_assets asset
  join public.market_asset_series series on series.id = asset.series_id
  where asset.id = v_purchase.asset_id;
  if coalesce(v_derivative_allowed, false) then
    update public.market_derivative_licenses
    set status = case when used_by_asset_id is null then 'active' else 'used' end,
        revoked_at = null
    where purchase_id = v_purchase.id and status = 'revoked';
  end if;

  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (
    null, 'stripe_dispute_won', 'market_purchase', v_purchase.id::text,
    jsonb_build_object('event_id', input_event_id, 'charge_id', input_charge_id)
  );
  return v_purchase.id;
end;
$$;

revoke all on function public.market_restore_stripe_purchase_v1(text, text)
  from public, anon, authenticated;
grant execute on function public.market_restore_stripe_purchase_v1(text, text)
  to service_role;

create or replace function public.market_cancel_stripe_checkout_v1(
  input_checkout_session_id text,
  input_event_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_purchase_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;
  update public.market_purchases
  set status = 'cancelled', provider_last_event_id = btrim(input_event_id), updated_at = timezone('utc', now())
  where provider_checkout_session_id = btrim(input_checkout_session_id)
    and status = 'pending'
  returning id into v_purchase_id;
  return v_purchase_id;
end;
$$;

revoke all on function public.market_cancel_stripe_checkout_v1(text, text)
  from public, anon, authenticated;
grant execute on function public.market_cancel_stripe_checkout_v1(text, text)
  to service_role;

create or replace function public.market_claim_payment_event_v1(
  input_event_id text,
  input_event_type text,
  input_object_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_existing public.market_payment_events%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;
  select * into v_existing
  from public.market_payment_events
  where event_id = btrim(input_event_id)
  for update;
  if found and v_existing.processing_status in ('processed', 'ignored') then
    return false;
  end if;
  if found
     and v_existing.processing_status = 'processing'
     and v_existing.updated_at > timezone('utc', now()) - interval '10 minutes' then
    return false;
  end if;
  if found then
    update public.market_payment_events
    set processing_status = 'processing',
        attempt_count = attempt_count + 1,
        event_type = btrim(input_event_type),
        object_id = left(coalesce(input_object_id, ''), 255),
        error_message = '',
        updated_at = timezone('utc', now())
    where event_id = btrim(input_event_id);
  else
    insert into public.market_payment_events(event_id, event_type, object_id)
    values (btrim(input_event_id), btrim(input_event_type), left(coalesce(input_object_id, ''), 255));
  end if;
  return true;
end;
$$;

revoke all on function public.market_claim_payment_event_v1(text, text, text)
  from public, anon, authenticated;
grant execute on function public.market_claim_payment_event_v1(text, text, text)
  to service_role;

create or replace function public.market_finish_payment_event_v1(
  input_event_id text,
  input_status text,
  input_error_message text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;
  if input_status not in ('processed', 'failed', 'ignored') then
    raise exception 'invalid event finish status';
  end if;
  update public.market_payment_events
  set processing_status = input_status,
      error_message = left(coalesce(input_error_message, ''), 1000),
      processed_at = case when input_status in ('processed', 'ignored') then timezone('utc', now()) else null end,
      updated_at = timezone('utc', now())
  where event_id = btrim(input_event_id);
end;
$$;

revoke all on function public.market_finish_payment_event_v1(text, text, text)
  from public, anon, authenticated;
grant execute on function public.market_finish_payment_event_v1(text, text, text)
  to service_role;
