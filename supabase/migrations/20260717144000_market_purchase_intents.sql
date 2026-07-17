-- Provider-neutral purchase preparation. Authenticated browser clients may
-- create only a pending purchase whose asset and amount are fixed by the
-- published catalog. They cannot mark it paid or grant rights.

alter table public.market_purchases
  add column if not exists expires_at timestamptz;

create unique index if not exists market_purchases_one_pending_per_buyer_asset
  on public.market_purchases(buyer_user_id, asset_id)
  where status = 'pending';

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
begin
  if v_user_id is null or exists (
    select 1 from auth.users where id = v_user_id and is_anonymous is true
  ) then
    raise exception 'confirmed account login required';
  end if;

  select * into v_asset
  from public.market_assets
  where id = input_asset_id
  for share;
  if not found or v_asset.status <> 'published' then
    raise exception 'published market asset required';
  end if;
  if v_asset.creator_user_id = v_user_id then
    raise exception 'creators cannot purchase their own asset';
  end if;

  select * into v_series
  from public.market_asset_series
  where id = v_asset.series_id
  for share;
  if not found or v_series.status <> 'published' then
    raise exception 'published market series required';
  end if;

  update public.market_purchases
  set status = 'cancelled'
  where buyer_user_id = v_user_id
    and asset_id = v_asset.id
    and status = 'pending'
    and coalesce(expires_at, created_at + interval '30 minutes') <= timezone('utc', now());

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
    expires_at
  ) values (
    v_asset.id,
    v_user_id,
    'standard_use',
    'pending',
    'jpy',
    v_asset.sale_price_yen,
    0,
    0,
    v_asset.sale_price_yen,
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
    v_user_id,
    'purchase_intent_created',
    'market_purchase',
    v_purchase.id::text,
    jsonb_build_object(
      'asset_id', v_asset.id,
      'gross_amount_yen', v_purchase.gross_amount_yen,
      'expires_at', v_purchase.expires_at
    )
  );

  return jsonb_build_object(
    'purchase_id', v_purchase.id,
    'asset_id', v_purchase.asset_id,
    'status', v_purchase.status,
    'currency', v_purchase.currency,
    'gross_amount_yen', v_purchase.gross_amount_yen,
    'expires_at', v_purchase.expires_at
  );
end;
$$;

revoke all on function public.market_create_purchase_intent_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.market_create_purchase_intent_v1(uuid)
  to authenticated;
