begin;

-- A withdrawn listing stays published so its detail page, derivative lineage,
-- licenses, completed purchases, and reward ledgers remain intact. Only new
-- sales are stopped.
alter table public.market_assets
  add column if not exists withdrawn_at timestamptz;

create index if not exists market_assets_withdrawn_idx
  on public.market_assets(withdrawn_at)
  where withdrawn_at is not null;

create or replace function public.market_withdraw_my_listing_v1(input_asset_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_asset public.market_assets%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;
  if not public.market_current_user_is_dev() then
    raise exception 'market_dev_access_required';
  end if;

  select * into v_asset
  from public.market_assets
  where id = input_asset_id
    and creator_user_id = v_user_id
  for update;

  if not found then
    raise exception 'owned market asset not found';
  end if;
  if v_asset.status <> 'published' then
    raise exception 'only published listings can be withdrawn';
  end if;
  if v_asset.withdrawn_at is not null then
    return jsonb_build_object(
      'asset_id', v_asset.id,
      'withdrawn_at', v_asset.withdrawn_at,
      'sold_out', true
    );
  end if;

  -- A buyer who already reached Stripe may still complete payment. Requiring
  -- that checkout to finish or expire avoids accepting payment after removal.
  if exists (
    select 1
    from public.market_purchases purchase
    where purchase.asset_id = v_asset.id
      and purchase.status = 'pending'
      and purchase.provider_checkout_session_id is not null
      and coalesce(purchase.expires_at, purchase.created_at + interval '30 minutes') > v_now
  ) then
    raise exception 'active checkout must finish or expire before withdrawal';
  end if;

  update public.market_purchases
  set status = 'cancelled', updated_at = v_now
  where asset_id = v_asset.id
    and status = 'pending'
    and (
      provider_checkout_session_id is null
      or coalesce(expires_at, created_at + interval '30 minutes') <= v_now
    );

  update public.market_assets
  set withdrawn_at = v_now,
      updated_at = v_now
  where id = v_asset.id;

  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (
    v_user_id,
    'listing_withdrawn',
    'market_asset',
    v_asset.id::text,
    jsonb_build_object(
      'withdrawn_at', v_now,
      'public_status', 'sold_out',
      'lineage_preserved', true,
      'rewards_preserved', true
    )
  );

  return jsonb_build_object(
    'asset_id', v_asset.id,
    'withdrawn_at', v_now,
    'sold_out', true
  );
end;
$$;

revoke all on function public.market_withdraw_my_listing_v1(uuid) from public, anon;
grant execute on function public.market_withdraw_my_listing_v1(uuid) to authenticated;

-- Preserve the already-tested limited-sale implementation behind a locked
-- withdrawal guard. The asset row lock serializes withdrawal and purchase.
alter function public.market_create_purchase_intent_v1(uuid)
  rename to market_create_purchase_intent_v1_before_withdrawal;
revoke all on function public.market_create_purchase_intent_v1_before_withdrawal(uuid)
  from public, anon, authenticated;

create function public.market_create_purchase_intent_v1(input_asset_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_withdrawn_at timestamptz;
begin
  select withdrawn_at into v_withdrawn_at
  from public.market_assets
  where id = input_asset_id
  for update;

  if v_withdrawn_at is not null then
    raise exception 'market asset is sold out';
  end if;

  return public.market_create_purchase_intent_v1_before_withdrawal(input_asset_id);
end;
$$;

revoke all on function public.market_create_purchase_intent_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.market_create_purchase_intent_v1(uuid)
  to authenticated;

-- Complimentary admin acquisition is also a new entitlement, so a withdrawn
-- listing must not create one. Existing grants and purchases remain untouched.
alter function public.market_grant_admin_asset_access_v1(uuid)
  rename to market_grant_admin_asset_access_v1_before_withdrawal;
revoke all on function public.market_grant_admin_asset_access_v1_before_withdrawal(uuid)
  from public, anon, authenticated;

create function public.market_grant_admin_asset_access_v1(input_asset_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_withdrawn_at timestamptz;
begin
  select withdrawn_at into v_withdrawn_at
  from public.market_assets
  where id = input_asset_id
  for update;

  if v_withdrawn_at is not null then
    raise exception 'market asset is sold out';
  end if;

  return public.market_grant_admin_asset_access_v1_before_withdrawal(input_asset_id);
end;
$$;

revoke all on function public.market_grant_admin_asset_access_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.market_grant_admin_asset_access_v1(uuid)
  to authenticated;

-- Prevent a checkout created concurrently with withdrawal from being bound.
alter function public.market_bind_stripe_checkout_v1(uuid, uuid, text, timestamptz)
  rename to market_bind_stripe_checkout_v1_before_withdrawal;
revoke all on function public.market_bind_stripe_checkout_v1_before_withdrawal(uuid, uuid, text, timestamptz)
  from public, anon, authenticated, service_role;

create function public.market_bind_stripe_checkout_v1(
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
declare
  v_withdrawn_at timestamptz;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  select asset.withdrawn_at into v_withdrawn_at
  from public.market_purchases purchase
  join public.market_assets asset on asset.id = purchase.asset_id
  where purchase.id = input_purchase_id
  for update of asset;

  if not found then
    raise exception 'market purchase not found';
  end if;
  if v_withdrawn_at is not null then
    raise exception 'market asset is sold out';
  end if;

  perform public.market_bind_stripe_checkout_v1_before_withdrawal(
    input_purchase_id,
    input_buyer_user_id,
    input_checkout_session_id,
    input_expires_at
  );
end;
$$;

revoke all on function public.market_bind_stripe_checkout_v1(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.market_bind_stripe_checkout_v1(uuid, uuid, text, timestamptz)
  to service_role;

create or replace function public.market_public_catalog_v1(input_limit integer default 120)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(catalog.asset order by catalog.published_at desc), '[]'::jsonb)
  from (
    select
      asset.published_at,
      jsonb_build_object(
        'id', asset.id,
        'parent_asset_id', asset.parent_asset_id,
        'creator_display_name', asset.creator_display_name,
        'title', asset.title,
        'description', asset.description,
        'sale_price_yen', asset.sale_price_yen,
        'asset_format', asset.asset_format,
        'included_formats', asset.included_formats,
        'ai_usage_status', asset.ai_usage_status,
        'tags', asset.tags,
        'favorite_count', asset.favorite_count,
        'derivative_count', asset.derivative_count,
        'limited_quantity', asset.limited_quantity,
        'limited_sold_count', asset.limited_sold_count,
        'withdrawn_at', asset.withdrawn_at,
        'preview_object_path', case when asset.preview_object_path ~ '^https://' then asset.preview_object_path else null end,
        'published_at', asset.published_at,
        'source_kind', asset.source_kind,
        'verification_status', asset.verification_status,
        'verification_level', asset.verification_level,
        'seller_identity_verified', asset.seller_identity_verified,
        'series', jsonb_build_object(
          'required_option_price_yen', series.required_option_price_yen,
          'derivative_sales_allowed', series.derivative_sales_allowed,
          'inherited_terms', series.inherited_terms
        )
      ) as asset
    from public.market_assets asset
    join public.market_asset_series series on series.id = asset.series_id
    where asset.status = 'published' and series.status = 'published'
    order by asset.published_at desc nulls last
    limit greatest(1, least(coalesce(input_limit, 120), 120))
  ) catalog;
$$;

create or replace function public.market_public_asset_v1(input_asset_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', asset.id,
    'parent_asset_id', asset.parent_asset_id,
    'creator_display_name', asset.creator_display_name,
    'title', asset.title,
    'description', asset.description,
    'sale_price_yen', asset.sale_price_yen,
    'asset_format', asset.asset_format,
    'included_formats', asset.included_formats,
    'ai_usage_status', asset.ai_usage_status,
    'tags', asset.tags,
    'favorite_count', asset.favorite_count,
    'derivative_count', asset.derivative_count,
    'limited_quantity', asset.limited_quantity,
    'limited_sold_count', asset.limited_sold_count,
    'withdrawn_at', asset.withdrawn_at,
    'preview_object_path', case when asset.preview_object_path ~ '^https://' then asset.preview_object_path else null end,
    'published_at', asset.published_at,
    'source_kind', asset.source_kind,
    'verification_status', asset.verification_status,
    'verification_level', asset.verification_level,
    'seller_identity_verified', asset.seller_identity_verified,
    'series', jsonb_build_object(
      'required_option_price_yen', series.required_option_price_yen,
      'derivative_sales_allowed', series.derivative_sales_allowed,
      'inherited_terms', series.inherited_terms
    )
  )
  from public.market_assets asset
  join public.market_asset_series series on series.id = asset.series_id
  where asset.id = input_asset_id and asset.status = 'published' and series.status = 'published';
$$;

revoke all on function public.market_public_catalog_v1(integer) from public, anon, authenticated;
revoke all on function public.market_public_asset_v1(uuid) from public, anon, authenticated;
grant execute on function public.market_public_catalog_v1(integer) to anon, authenticated;
grant execute on function public.market_public_asset_v1(uuid) to anon, authenticated;

create or replace function public.market_my_listings_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;
  if not public.market_current_user_is_dev() then
    raise exception 'market_dev_access_required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', asset.id,
    'title', asset.title,
    'status', asset.status,
    'sale_price_yen', asset.sale_price_yen,
    'asset_format', asset.asset_format,
    'included_formats', asset.included_formats,
    'withdrawn_at', asset.withdrawn_at,
    'preview_url', case
      when asset.status = 'published' and asset.preview_object_path ~ '^https://' then asset.preview_object_path
      else null
    end,
    'published_at', asset.published_at,
    'created_at', asset.created_at,
    'updated_at', asset.updated_at
  ) order by asset.created_at desc), '[]'::jsonb)
  into v_result
  from (
    select own.*
    from public.market_assets own
    where own.creator_user_id = v_user_id
    order by own.created_at desc
    limit 100
  ) asset;

  return v_result;
end;
$$;

revoke all on function public.market_my_listings_v1() from public, anon;
grant execute on function public.market_my_listings_v1() to authenticated;

commit;
