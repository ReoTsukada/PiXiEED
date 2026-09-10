-- Simplify the creator-facing listing model without removing the existing
-- Market, entitlement, lineage, or PiXYNC contracts.
--
-- User-facing policy:
--   * showcase: visible, but never acquirable
--   * acquire: price 0 means free, price >= 500 means paid
--   * use/derivative/participants are explicit metadata, never inferred from
--     an edit history or from a tiny contribution such as one pixel.

alter table public.market_assets
  add column if not exists acquisition_enabled boolean not null default true;

comment on column public.market_assets.acquisition_enabled is
  'Whether the published listing may be acquired. False means showcase-only; missing legacy data remains compatible as true.';

-- Preserve the policy in the canonical asset row while keeping the existing
-- RPC signatures unchanged. The UI writes the same policy into provenance so
-- old clients and server-side package verification can continue to inspect it.
create or replace function public.market_apply_listing_policy_v1()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_policy jsonb;
begin
  v_policy := case
    when jsonb_typeof(coalesce(new.provenance_manifest -> 'listing_policy', '{}'::jsonb)) = 'object'
      then new.provenance_manifest -> 'listing_policy'
    else '{}'::jsonb
  end;

  if jsonb_typeof(v_policy -> 'acquisitionEnabled') = 'boolean' then
    new.acquisition_enabled := (v_policy ->> 'acquisitionEnabled')::boolean;
  end if;

  -- A showcase item can remain visible, but it cannot accidentally retain a
  -- limited-sale inventory that a future client might try to acquire.
  if new.acquisition_enabled is false then
    new.limited_quantity := null;
    new.limited_sold_count := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists market_assets_apply_listing_policy on public.market_assets;
create trigger market_assets_apply_listing_policy
before insert or update of provenance_manifest, acquisition_enabled, limited_quantity, limited_sold_count on public.market_assets
for each row execute function public.market_apply_listing_policy_v1();

-- Existing rows are paid/free listings unless their stored policy explicitly
-- says showcase. This avoids changing the meaning of historical products.
update public.market_assets
set acquisition_enabled = ((provenance_manifest #>> '{listing_policy,acquisitionEnabled}') = 'true')
where jsonb_typeof(provenance_manifest #> '{listing_policy,acquisitionEnabled}') = 'boolean';

-- Defense in depth for all purchase paths, including old RPCs and admin/free
-- grant paths. Settling a purchase that already existed before a listing was
-- switched to showcase remains possible; new pending/grant records do not.
create or replace function public.market_reject_showcase_acquisition_v1()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_acquisition_enabled boolean;
begin
  select acquisition_enabled into v_acquisition_enabled
  from public.market_assets
  where id = new.asset_id;
  if v_acquisition_enabled is false
     and (tg_op = 'INSERT' or new.status = 'pending' or new.payment_provider in ('free_acquisition', 'admin_grant')) then
    raise exception 'market asset is showcase only';
  end if;
  return new;
end;
$$;

drop trigger if exists market_purchases_reject_showcase_acquisition on public.market_purchases;
create trigger market_purchases_reject_showcase_acquisition
before insert or update on public.market_purchases
for each row execute function public.market_reject_showcase_acquisition_v1();

-- Keep public catalog/detail/SEO payloads compatible while exposing the one
-- new decision the simplified UI needs. Legacy rows and static SEO fixtures
-- without this key remain acquirable in the browser.
create or replace function public.market_public_catalog_v1(input_limit integer default 120)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(catalog.asset order by catalog.published_at desc nulls last), '[]'::jsonb)
  from (
    select asset.published_at, jsonb_build_object(
      'id', asset.id,
      'parent_asset_id', asset.parent_asset_id,
      'creator_display_name', asset.creator_display_name,
      'creator_profile_url', asset.creator_profile_url,
      'title', asset.title,
      'description', asset.description,
      'sale_price_yen', asset.sale_price_yen,
      'acquisition_enabled', asset.acquisition_enabled,
      'free_acquisition_available', asset.acquisition_enabled and asset.sale_price_yen = 0,
      'rights', case
        when 'commercial-use' = any(coalesce(series.selected_option_ids, array[]::text[]))
          or 'game-app-use' = any(coalesce(series.selected_option_ids, array[]::text[]))
          then jsonb_build_array('in-game-use')
        else '[]'::jsonb
      end,
      'asset_format', asset.asset_format,
      'included_formats', asset.included_formats,
      'media_kinds', coalesce((
        select jsonb_agg(k.media_kind order by k.media_kind)
        from (
          select distinct formats.media_kind
          from public.market_asset_formats as formats
          where formats.id = any(coalesce(asset.included_formats, array[]::text[]))
        ) as k
      ), '[]'::jsonb),
      'ai_usage_status', asset.ai_usage_status,
      'tags', asset.tags,
      'favorite_count', asset.favorite_count,
      'derivative_count', asset.derivative_count,
      'limited_quantity', asset.limited_quantity,
      'limited_sold_count', asset.limited_sold_count,
      'published_at', asset.published_at,
      'source_kind', asset.source_kind,
      'verification_status', asset.verification_status,
      'verification_level', asset.verification_level,
      'seller_identity_verified', asset.seller_identity_verified,
      'package_revision', case when revision.id is null then null else jsonb_build_object(
        'id', revision.id,
        'number', revision.revision_number,
        'content_hash', revision.content_hash,
        'source_sha256', revision.source_sha256,
        'package_hash', revision.package_hash
      ) end,
      'series', jsonb_build_object(
        'required_option_price_yen', series.required_option_price_yen,
        'derivative_sales_allowed', series.derivative_sales_allowed,
        'inherited_terms', series.inherited_terms
      )
    ) as asset
    from public.market_assets as asset
    join public.market_asset_series as series on series.id = asset.series_id
    left join public.market_asset_revisions as revision
      on revision.id = asset.active_revision_id and revision.status = 'active'
    where asset.status = 'published'
      and series.status = 'published'
      and asset.withdrawn_at is null
      and (asset.limited_quantity is null or asset.limited_quantity <= 0
        or coalesce(asset.limited_sold_count, 0) < asset.limited_quantity)
    order by asset.published_at desc nulls last
    limit greatest(1, least(coalesce(input_limit, 120), 120))
  ) as catalog;
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
    'creator_profile_url', asset.creator_profile_url,
    'title', asset.title,
    'description', asset.description,
    'sale_price_yen', asset.sale_price_yen,
    'acquisition_enabled', asset.acquisition_enabled,
    'free_acquisition_available', asset.acquisition_enabled and asset.sale_price_yen = 0,
    'rights', case
      when 'commercial-use' = any(coalesce(series.selected_option_ids, array[]::text[]))
        or 'game-app-use' = any(coalesce(series.selected_option_ids, array[]::text[]))
        then jsonb_build_array('in-game-use')
      else '[]'::jsonb
    end,
    'asset_format', asset.asset_format,
    'included_formats', asset.included_formats,
    'media_kinds', coalesce((
      select jsonb_agg(k.media_kind order by k.media_kind)
      from (
        select distinct formats.media_kind
        from public.market_asset_formats as formats
        where formats.id = any(coalesce(asset.included_formats, array[]::text[]))
      ) as k
    ), '[]'::jsonb),
    'ai_usage_status', asset.ai_usage_status,
    'tags', asset.tags,
    'favorite_count', asset.favorite_count,
    'derivative_count', asset.derivative_count,
    'limited_quantity', asset.limited_quantity,
    'limited_sold_count', asset.limited_sold_count,
    'published_at', asset.published_at,
    'source_kind', asset.source_kind,
    'verification_status', asset.verification_status,
    'verification_level', asset.verification_level,
    'seller_identity_verified', asset.seller_identity_verified,
    'package_revision', case when revision.id is null then null else jsonb_build_object(
      'id', revision.id,
      'number', revision.revision_number,
      'content_hash', revision.content_hash,
      'source_sha256', revision.source_sha256,
      'package_hash', revision.package_hash
    ) end,
    'series', jsonb_build_object(
      'required_option_price_yen', series.required_option_price_yen,
      'derivative_sales_allowed', series.derivative_sales_allowed,
      'inherited_terms', series.inherited_terms
    )
  )
  from public.market_assets as asset
  join public.market_asset_series as series on series.id = asset.series_id
  left join public.market_asset_revisions as revision
    on revision.id = asset.active_revision_id and revision.status = 'active'
  where asset.id = input_asset_id
    and asset.status = 'published'
    and series.status = 'published'
    and asset.withdrawn_at is null
    and (asset.limited_quantity is null or asset.limited_quantity <= 0
      or coalesce(asset.limited_sold_count, 0) < asset.limited_quantity);
$$;

create or replace function public.market_public_seo_catalog_v1()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(catalog.asset order by catalog.published_at desc nulls last), '[]'::jsonb)
  from (
    select asset.published_at, jsonb_build_object(
      'id', asset.id,
      'creator_display_name', asset.creator_display_name,
      'creator_profile_url', asset.creator_profile_url,
      'title', asset.title,
      'description', asset.description,
      'sale_price_yen', asset.sale_price_yen,
      'acquisition_enabled', asset.acquisition_enabled,
      'free_acquisition_available', asset.acquisition_enabled and asset.sale_price_yen = 0,
      'rights', case
        when 'commercial-use' = any(coalesce(series.selected_option_ids, array[]::text[]))
          or 'game-app-use' = any(coalesce(series.selected_option_ids, array[]::text[]))
          then jsonb_build_array('in-game-use')
        else '[]'::jsonb
      end,
      'asset_format', asset.asset_format,
      'included_formats', asset.included_formats,
      'tags', asset.tags,
      'limited_quantity', asset.limited_quantity,
      'limited_sold_count', asset.limited_sold_count,
      'published_at', asset.published_at,
      'package_revision', case when revision.id is null then null else jsonb_build_object(
        'id', revision.id,
        'number', revision.revision_number,
        'content_hash', revision.content_hash
      ) end,
      'series', jsonb_build_object(
        'required_option_price_yen', series.required_option_price_yen,
        'derivative_sales_allowed', series.derivative_sales_allowed,
        'inherited_terms', series.inherited_terms
      )
    ) as asset
    from public.market_assets as asset
    join public.market_asset_series as series on series.id = asset.series_id
    left join public.market_asset_revisions as revision
      on revision.id = asset.active_revision_id and revision.status = 'active'
    where asset.status = 'published'
      and series.status = 'published'
      and asset.withdrawn_at is null
    order by asset.published_at desc nulls last
  ) as catalog;
$$;

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
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', asset.id,
    'title', asset.title,
    'status', asset.status,
    'sale_price_yen', asset.sale_price_yen,
    'acquisition_enabled', asset.acquisition_enabled,
    'asset_format', asset.asset_format,
    'included_formats', asset.included_formats,
    'withdrawn_at', asset.withdrawn_at,
    'preview_object_path', asset.preview_object_path,
    'published_at', asset.published_at,
    'created_at', asset.created_at,
    'updated_at', asset.updated_at
  ) order by asset.created_at desc), '[]'::jsonb) into v_result
  from (
    select own.*
    from public.market_assets as own
    where own.creator_user_id = v_user_id
    order by own.created_at desc
    limit 100
  ) as asset;
  return v_result;
end;
$$;

revoke all on function public.market_apply_listing_policy_v1() from public, anon, authenticated;
revoke all on function public.market_reject_showcase_acquisition_v1() from public, anon, authenticated;
revoke all on function public.market_public_catalog_v1(integer) from public, anon, authenticated;
revoke all on function public.market_public_asset_v1(uuid) from public, anon, authenticated;
revoke all on function public.market_public_seo_catalog_v1() from public, anon, authenticated;
revoke all on function public.market_my_listings_v1() from public, anon;
grant execute on function public.market_public_catalog_v1(integer) to anon, authenticated;
grant execute on function public.market_public_asset_v1(uuid) to anon, authenticated;
grant execute on function public.market_public_seo_catalog_v1() to anon, authenticated;
grant execute on function public.market_my_listings_v1() to authenticated;
