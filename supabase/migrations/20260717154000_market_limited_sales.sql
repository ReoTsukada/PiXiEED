-- Limited marketplace sales. A pending purchase reserves one unit while its
-- checkout is active. Paid and disputed purchases continue to occupy a unit.

alter table public.market_assets
  add column if not exists limited_quantity integer,
  add column if not exists limited_sold_count integer not null default 0;

alter table public.market_assets drop constraint if exists market_assets_limited_quantity_valid;
alter table public.market_assets add constraint market_assets_limited_quantity_valid
  check (limited_quantity is null or limited_quantity between 1 and 100000);
alter table public.market_assets drop constraint if exists market_assets_limited_sold_count_valid;
alter table public.market_assets add constraint market_assets_limited_sold_count_valid
  check (
    limited_sold_count >= 0
    and (limited_quantity is null or limited_sold_count <= limited_quantity)
  );
alter table public.market_assets drop constraint if exists market_assets_limited_minimum_price;
alter table public.market_assets add constraint market_assets_limited_minimum_price
  check (limited_quantity is null or sale_price_yen >= 1000);

create index if not exists market_assets_limited_available_idx
  on public.market_assets(status, limited_sold_count, limited_quantity)
  where limited_quantity is not null;

create or replace function public.market_set_listing_limited_sale(
  input_asset_id uuid,
  input_enabled boolean,
  input_quantity integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset public.market_assets%rowtype;
  v_total_price integer;
  v_quantity integer;
begin
  if not public.market_current_user_can_sell() then
    raise exception 'verified seller account required';
  end if;

  select * into v_asset
  from public.market_assets
  where id = input_asset_id
    and creator_user_id = auth.uid()
    and status = 'draft'
  for update;
  if not found then raise exception 'editable draft not found'; end if;
  v_total_price := v_asset.sale_price_yen;

  if coalesce(input_enabled, false) then
    v_quantity := input_quantity;
    if v_quantity is null or v_quantity not between 1 and 100000 then
      raise exception 'limited quantity must be between 1 and 100000';
    end if;
    if v_total_price < 1000 then
      raise exception 'limited sale price must be at least 1000 yen';
    end if;
  else
    v_quantity := null;
  end if;

  update public.market_assets
  set limited_quantity = v_quantity,
      limited_sold_count = 0,
      updated_at = timezone('utc', now())
  where id = input_asset_id;

  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (
    auth.uid(), 'listing_limited_sale_updated', 'market_asset', input_asset_id::text,
    jsonb_build_object('enabled', v_quantity is not null, 'quantity', v_quantity, 'minimum_price_yen', 1000)
  );
  return jsonb_build_object('enabled', v_quantity is not null, 'quantity', v_quantity);
end;
$$;

revoke all on function public.market_set_listing_limited_sale(uuid, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.market_set_listing_limited_sale(uuid, boolean, integer)
  to authenticated;

create or replace function public.market_refresh_asset_limited_sold_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_id uuid;
begin
  v_asset_id := case when tg_op = 'DELETE' then old.asset_id else new.asset_id end;
  update public.market_assets as asset
  set limited_sold_count = case
        when asset.limited_quantity is null then 0
        else (
          select count(*)::integer
          from public.market_purchases as purchase
          where purchase.asset_id = v_asset_id
            and purchase.status in ('paid', 'disputed')
        )
      end,
      updated_at = timezone('utc', now())
  where asset.id = v_asset_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists market_purchases_refresh_limited_sold_count on public.market_purchases;
create trigger market_purchases_refresh_limited_sold_count
after insert or delete or update of status on public.market_purchases
for each row execute function public.market_refresh_asset_limited_sold_count();
revoke all on function public.market_refresh_asset_limited_sold_count()
  from public, anon, authenticated;

update public.market_assets as asset
set limited_sold_count = case
  when asset.limited_quantity is null then 0
  else (
    select count(*)::integer
    from public.market_purchases as purchase
    where purchase.asset_id = asset.id
      and purchase.status in ('paid', 'disputed')
  )
end;

create or replace function public.market_create_purchase_intent_v1(
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
  v_existing_pending_id uuid;
  v_reserved_count integer := 0;
  v_sold_count integer := 0;
begin
  if v_user_id is null or exists (
    select 1 from auth.users where id = v_user_id and is_anonymous is true
  ) then
    raise exception 'confirmed account login required';
  end if;

  -- Exclusive asset locking serializes buyers competing for the final unit.
  select * into v_asset
  from public.market_assets
  where id = input_asset_id
  for update;
  if not found or v_asset.status <> 'published' then
    raise exception 'published market asset required';
  end if;
  if v_asset.creator_user_id = v_user_id then
    raise exception 'creators cannot purchase their own asset';
  end if;
  if exists (
    select 1 from public.market_purchases
    where buyer_user_id = v_user_id and asset_id = v_asset.id
      and status in ('paid', 'disputed')
  ) then
    raise exception 'asset is already purchased';
  end if;

  select * into v_series
  from public.market_asset_series
  where id = v_asset.series_id
  for share;
  if not found or v_series.status <> 'published' then
    raise exception 'published market series required';
  end if;

  -- An unbound intent cannot receive a payment and may be released locally.
  -- Bound Stripe sessions are released only by the signed Stripe webhook.
  update public.market_purchases
  set status = 'cancelled', updated_at = timezone('utc', now())
  where buyer_user_id = v_user_id
    and asset_id = v_asset.id
    and status = 'pending'
    and provider_checkout_session_id is null
    and coalesce(expires_at, created_at + interval '30 minutes') <= timezone('utc', now());

  select id into v_existing_pending_id
  from public.market_purchases
  where buyer_user_id = v_user_id
    and asset_id = v_asset.id
    and status = 'pending';

  if v_asset.limited_quantity is not null then
    select
      count(*) filter (where status in ('paid', 'disputed'))::integer,
      count(*) filter (
        where status in ('paid', 'disputed')
          or (
            status = 'pending'
            and (
              provider_checkout_session_id is not null
              or coalesce(expires_at, created_at + interval '30 minutes') > timezone('utc', now())
            )
          )
      )::integer
    into v_sold_count, v_reserved_count
    from public.market_purchases
    where asset_id = v_asset.id
      and (v_existing_pending_id is null or id <> v_existing_pending_id);

    if v_reserved_count >= v_asset.limited_quantity then
      if v_sold_count >= v_asset.limited_quantity then
        raise exception 'limited asset is sold out';
      end if;
      raise exception 'all remaining limited units are currently reserved';
    end if;
  end if;

  insert into public.market_purchases (
    asset_id, buyer_user_id, purchase_kind, status, currency,
    gross_amount_yen, processor_fee_yen, platform_fee_yen,
    distributable_amount_yen, expires_at
  ) values (
    v_asset.id, v_user_id, 'standard_use', 'pending', 'jpy',
    v_asset.sale_price_yen, 0, 0, v_asset.sale_price_yen,
    timezone('utc', now()) + interval '30 minutes'
  )
  on conflict (buyer_user_id, asset_id) where status = 'pending'
  do update set
    gross_amount_yen = excluded.gross_amount_yen,
    processor_fee_yen = 0,
    platform_fee_yen = 0,
    distributable_amount_yen = excluded.gross_amount_yen,
    expires_at = excluded.expires_at
  where market_purchases.payment_provider is null
    and market_purchases.provider_payment_id is null
  returning * into v_purchase;

  if not found then
    select * into v_purchase
    from public.market_purchases
    where buyer_user_id = v_user_id
      and asset_id = v_asset.id
      and status = 'pending';
  end if;

  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (
    v_user_id, 'purchase_intent_created', 'market_purchase', v_purchase.id::text,
    jsonb_build_object(
      'asset_id', v_asset.id,
      'gross_amount_yen', v_purchase.gross_amount_yen,
      'expires_at', v_purchase.expires_at,
      'limited_quantity', v_asset.limited_quantity
    )
  );

  return jsonb_build_object(
    'purchase_id', v_purchase.id,
    'asset_id', v_purchase.asset_id,
    'status', v_purchase.status,
    'currency', v_purchase.currency,
    'gross_amount_yen', v_purchase.gross_amount_yen,
    'expires_at', v_purchase.expires_at,
    'limited_quantity', v_asset.limited_quantity
  );
end;
$$;

revoke all on function public.market_create_purchase_intent_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.market_create_purchase_intent_v1(uuid)
  to authenticated;
