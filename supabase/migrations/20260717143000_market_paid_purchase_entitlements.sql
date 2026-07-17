-- Materialize the rights and royalty records that follow a verified paid
-- purchase. Payment-provider webhooks call this service-only function after
-- inserting/updating market_purchases; browser clients cannot grant rights.

create unique index if not exists market_derivative_licenses_purchase_unique
  on public.market_derivative_licenses(purchase_id)
  where purchase_id is not null;

comment on table public.market_derivative_licenses is
  'One free derivative-listing right attached to a paid purchase when the source series allows derivative sales. The legacy table name does not represent an additional fee.';

create or replace function public.market_materialize_paid_purchase_v1(
  input_purchase_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.market_purchases%rowtype;
  v_asset public.market_assets%rowtype;
  v_series public.market_asset_series%rowtype;
  v_listing_right_id uuid;
begin
  select * into v_purchase
  from public.market_purchases
  where id = input_purchase_id
  for update;

  if not found or v_purchase.status <> 'paid' or v_purchase.paid_at is null then
    raise exception 'a completed paid purchase is required';
  end if;
  if v_purchase.purchase_kind <> 'standard_use' then
    raise exception 'legacy derivative-license upgrade purchases are not supported';
  end if;
  if v_purchase.distributable_amount_yen < 0
     or v_purchase.processor_fee_yen + v_purchase.platform_fee_yen > v_purchase.gross_amount_yen then
    raise exception 'invalid paid purchase amounts';
  end if;

  select * into v_asset
  from public.market_assets
  where id = v_purchase.asset_id
  for share;
  if not found or v_asset.status <> 'published' then
    raise exception 'purchased asset is not published';
  end if;
  if v_purchase.gross_amount_yen <> v_asset.sale_price_yen then
    raise exception 'paid amount does not match the published sale price';
  end if;

  select * into v_series
  from public.market_asset_series
  where id = v_asset.series_id
  for share;
  if not found or v_series.status <> 'published' then
    raise exception 'purchased asset series is not published';
  end if;

  perform public.market_create_royalty_ledger(v_purchase.id);

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
    auth.uid(),
    'paid_purchase_materialized',
    'market_purchase',
    v_purchase.id::text,
    jsonb_build_object(
      'asset_id', v_purchase.asset_id,
      'buyer_user_id', v_purchase.buyer_user_id,
      'derivative_listing_right_id', v_listing_right_id,
      'derivative_sales_allowed', v_series.derivative_sales_allowed
    )
  );

  return v_listing_right_id;
end;
$$;

revoke all on function public.market_materialize_paid_purchase_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.market_materialize_paid_purchase_v1(uuid)
  to service_role;
