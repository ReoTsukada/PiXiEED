-- Require a current legal confirmation and AI-use declaration for every new listing.
-- Existing test listings remain distinguishable as not-declared.

alter table public.market_assets
  add column if not exists ai_usage_status text not null default 'not-declared',
  add column if not exists terms_version text,
  add column if not exists privacy_version text,
  add column if not exists legal_confirmed_at timestamptz;

alter table public.market_assets
  drop constraint if exists market_assets_ai_usage_status_valid;
alter table public.market_assets
  add constraint market_assets_ai_usage_status_valid
  check (ai_usage_status in ('used', 'not-used', 'not-declared'));

create or replace function public.market_create_root_asset_v4(
  input_title text,
  input_description text,
  input_sale_price_yen integer,
  input_derivative_sales_allowed boolean,
  input_source_kind text,
  input_source_sha256 text,
  input_asset_formats text[],
  input_selected_option_ids text[],
  input_option_prices jsonb,
  input_provenance_manifest jsonb,
  input_inherited_terms jsonb,
  input_prohibited_uses jsonb,
  input_change_summary jsonb,
  input_terms_version text,
  input_privacy_version text,
  input_ai_usage_status text,
  input_terms_confirmed boolean,
  input_privacy_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_id uuid;
  v_current_terms_version constant text := '2026-07-18';
  v_current_privacy_version constant text := '2026-07-18';
  v_confirmed_at timestamptz := timezone('utc', now());
begin
  if input_terms_confirmed is not true or input_privacy_confirmed is not true then
    raise exception 'terms and privacy confirmation required';
  end if;
  if input_terms_version is distinct from v_current_terms_version
     or input_privacy_version is distinct from v_current_privacy_version then
    raise exception 'legal document version is outdated';
  end if;
  if input_ai_usage_status is null or input_ai_usage_status not in ('used', 'not-used') then
    raise exception 'AI usage declaration required';
  end if;

  v_asset_id := public.market_create_root_asset_v3(
    input_title,
    input_description,
    input_sale_price_yen,
    input_derivative_sales_allowed,
    input_source_kind,
    input_source_sha256,
    input_asset_formats,
    input_selected_option_ids,
    input_option_prices,
    coalesce(input_provenance_manifest, '{}'::jsonb),
    input_inherited_terms,
    input_prohibited_uses,
    input_change_summary
  );

  update public.market_assets
  set ai_usage_status = input_ai_usage_status,
      terms_version = v_current_terms_version,
      privacy_version = v_current_privacy_version,
      legal_confirmed_at = v_confirmed_at,
      provenance_manifest = coalesce(provenance_manifest, '{}'::jsonb) || jsonb_build_object(
        'ai_usage_status', input_ai_usage_status,
        'legal_confirmation', jsonb_build_object(
          'terms_version', v_current_terms_version,
          'privacy_version', v_current_privacy_version,
          'confirmed_at', v_confirmed_at
        )
      )
  where id = v_asset_id;

  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (
    auth.uid(),
    'listing_legal_ai_declared',
    'market_asset',
    v_asset_id::text,
    jsonb_build_object(
      'terms_version', v_current_terms_version,
      'privacy_version', v_current_privacy_version,
      'ai_usage_status', input_ai_usage_status,
      'confirmed_at', v_confirmed_at
    )
  );

  return v_asset_id;
end;
$$;

-- Browser clients must use v4; v3 remains an internal implementation detail.
revoke all on function public.market_create_root_asset_v3(text, text, integer, boolean, text, text, text[], text[], jsonb, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.market_create_root_asset_v4(text, text, integer, boolean, text, text, text[], text[], jsonb, jsonb, jsonb, jsonb, jsonb, text, text, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.market_create_root_asset_v4(text, text, integer, boolean, text, text, text[], text[], jsonb, jsonb, jsonb, jsonb, jsonb, text, text, text, boolean, boolean)
  to authenticated;

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
