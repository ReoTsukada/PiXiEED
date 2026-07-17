-- Administrators may acquire an asset for operational verification without a
-- Stripe payment. Admin grants are delivery entitlements, not sales: they do
-- not reserve limited inventory, create revenue, or enter royalty payouts.

alter table public.market_purchases
  drop constraint if exists market_purchases_status_check;
alter table public.market_purchases
  add constraint market_purchases_status_check
  check (status in ('pending', 'paid', 'granted', 'refunded', 'disputed', 'cancelled'));

alter table public.market_purchases
  drop constraint if exists market_purchases_admin_grant_valid;
alter table public.market_purchases
  add constraint market_purchases_admin_grant_valid
  check (
    (status = 'granted') = (coalesce(payment_provider, '') = 'admin_grant')
    and (
      status <> 'granted'
      or (
        purchase_kind = 'standard_use'
        and provider_payment_id is not null
        and provider_checkout_session_id is null
        and provider_charge_id is null
        and provider_refund_id is null
        and gross_amount_yen = 0
        and processor_fee_yen = 0
        and platform_fee_yen = 0
        and distributable_amount_yen = 0
        and paid_at is null
        and refunded_at is null
      )
    )
  );

create unique index if not exists market_purchases_one_admin_grant_per_buyer_asset
  on public.market_purchases(buyer_user_id, asset_id)
  where status = 'granted';

create or replace function public.market_enforce_minimum_purchase_amount()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated')
     and not public.market_current_user_is_dev() then
    raise exception 'market DEV access required';
  end if;
  if new.status = 'granted' then
    if new.payment_provider <> 'admin_grant'
       or new.gross_amount_yen <> 0
       or new.processor_fee_yen <> 0
       or new.platform_fee_yen <> 0
       or new.distributable_amount_yen <> 0 then
      raise exception 'invalid admin market grant';
    end if;
    return new;
  end if;
  if new.purchase_kind = 'standard_use' and new.gross_amount_yen < 500 then
    raise exception 'market purchase amount must be at least 500 yen';
  end if;
  return new;
end;
$$;

create or replace function public.market_prevent_purchase_after_admin_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'granted' and exists (
    select 1
    from public.market_purchases as existing
    where existing.buyer_user_id = new.buyer_user_id
      and existing.asset_id = new.asset_id
      and existing.status = 'granted'
      and existing.id <> new.id
  ) then
    raise exception 'asset access is already granted to this administrator';
  end if;
  return new;
end;
$$;

drop trigger if exists market_purchases_prevent_purchase_after_admin_grant
  on public.market_purchases;
create trigger market_purchases_prevent_purchase_after_admin_grant
before insert or update of asset_id, buyer_user_id, status
on public.market_purchases
for each row execute function public.market_prevent_purchase_after_admin_grant();

revoke all on function public.market_prevent_purchase_after_admin_grant()
  from public, anon, authenticated;

create or replace function public.market_grant_admin_asset_access_v1(
  input_asset_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_asset public.market_assets%rowtype;
  v_series public.market_asset_series%rowtype;
  v_purchase public.market_purchases%rowtype;
  v_listing_right_id uuid;
begin
  if v_user_id is null or not public.market_current_user_is_admin() then
    raise exception 'admin permission required';
  end if;

  select * into v_asset
  from public.market_assets
  where id = input_asset_id
  for update;
  if not found or v_asset.status <> 'published' then
    raise exception 'published market asset required';
  end if;

  select * into v_purchase
  from public.market_purchases
  where buyer_user_id = v_user_id
    and asset_id = v_asset.id
    and status in ('paid', 'granted', 'disputed')
  order by created_at desc
  limit 1;

  if found then
    if v_purchase.status = 'disputed' then
      raise exception 'the existing purchase is under payment review';
    end if;
    return jsonb_build_object(
      'purchase_id', v_purchase.id,
      'asset_id', v_purchase.asset_id,
      'status', v_purchase.status,
      'already_available', true,
      'counts_as_sale', v_purchase.status = 'paid'
    );
  end if;

  if exists (
    select 1
    from public.market_purchases
    where buyer_user_id = v_user_id
      and asset_id = v_asset.id
      and status = 'pending'
      and provider_checkout_session_id is not null
  ) then
    raise exception 'a Stripe checkout is already in progress for this asset';
  end if;

  update public.market_purchases
  set status = 'cancelled',
      updated_at = timezone('utc', now())
  where buyer_user_id = v_user_id
    and asset_id = v_asset.id
    and status = 'pending'
    and provider_checkout_session_id is null;

  select * into v_series
  from public.market_asset_series
  where id = v_asset.series_id
  for share;
  if not found or v_series.status <> 'published' then
    raise exception 'published market series required';
  end if;

  insert into public.market_purchases (
    asset_id,
    buyer_user_id,
    purchase_kind,
    status,
    currency,
    gross_amount_yen,
    processor_fee_yen,
    platform_fee_yen,
    distributable_amount_yen,
    payment_provider,
    provider_payment_id
  ) values (
    v_asset.id,
    v_user_id,
    'standard_use',
    'granted',
    'jpy',
    0,
    0,
    0,
    0,
    'admin_grant',
    v_user_id::text || ':' || v_asset.id::text
  )
  returning * into v_purchase;

  if v_series.derivative_sales_allowed then
    insert into public.market_derivative_licenses (
      source_asset_id,
      purchaser_user_id,
      purchase_id,
      status,
      allowed_listing_count
    ) values (
      v_purchase.asset_id,
      v_purchase.buyer_user_id,
      v_purchase.id,
      'active',
      1
    )
    on conflict do nothing;

    select id into v_listing_right_id
    from public.market_derivative_licenses
    where purchase_id = v_purchase.id;
  end if;

  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (
    v_user_id,
    'admin_asset_access_granted',
    'market_purchase',
    v_purchase.id::text,
    jsonb_build_object(
      'asset_id', v_asset.id,
      'counts_as_sale', false,
      'gross_amount_yen', 0,
      'limited_inventory_consumed', false,
      'royalty_ledger_created', false,
      'derivative_listing_right_id', v_listing_right_id
    )
  );

  return jsonb_build_object(
    'purchase_id', v_purchase.id,
    'asset_id', v_purchase.asset_id,
    'status', v_purchase.status,
    'already_available', false,
    'counts_as_sale', false,
    'derivative_listing_right_id', v_listing_right_id
  );
end;
$$;

revoke all on function public.market_grant_admin_asset_access_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.market_grant_admin_asset_access_v1(uuid)
  to authenticated;

comment on function public.market_grant_admin_asset_access_v1(uuid) is
  'Grants a zero-yen admin delivery entitlement. It is excluded from sales, limited inventory, Stripe, royalties, and payouts.';
