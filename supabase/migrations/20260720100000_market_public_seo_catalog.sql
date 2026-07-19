-- 公開済み商品の静的SEOページ生成専用。購入者情報や元データは返さない。
create or replace function public.market_public_seo_catalog_v1()
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
        'creator_display_name', asset.creator_display_name,
        'title', asset.title,
        'description', asset.description,
        'sale_price_yen', asset.sale_price_yen,
        'asset_format', asset.asset_format,
        'included_formats', asset.included_formats,
        'tags', asset.tags,
        'limited_quantity', asset.limited_quantity,
        'limited_sold_count', asset.limited_sold_count,
        'published_at', asset.published_at,
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
    order by asset.published_at desc nulls last
  ) catalog;
$$;

revoke all on function public.market_public_seo_catalog_v1() from public, anon, authenticated;
grant execute on function public.market_public_seo_catalog_v1() to anon, authenticated;
