-- 売り切れ・取り下げ済みの商品は一般公開catalogと直URLから外す。
-- 購入記録、利用権、系列、報酬の履歴はmarket_assets側に残る。
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
    where asset.status = 'published'
      and series.status = 'published'
      and asset.withdrawn_at is null
      and (asset.limited_quantity is null or asset.limited_quantity <= 0 or coalesce(asset.limited_sold_count, 0) < asset.limited_quantity)
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
  where asset.id = input_asset_id
    and asset.status = 'published'
    and series.status = 'published'
    and asset.withdrawn_at is null
    and (asset.limited_quantity is null or asset.limited_quantity <= 0 or coalesce(asset.limited_sold_count, 0) < asset.limited_quantity);
$$;

revoke all on function public.market_public_catalog_v1(integer) from public, anon, authenticated;
revoke all on function public.market_public_asset_v1(uuid) from public, anon, authenticated;
grant execute on function public.market_public_catalog_v1(integer) to anon, authenticated;
grant execute on function public.market_public_asset_v1(uuid) to anon, authenticated;
