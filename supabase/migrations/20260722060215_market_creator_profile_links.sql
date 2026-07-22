-- 公開プロフィールURLは、作者がマイページで明示的に設定したものだけを
-- 出品データへ複写して公開カタログから返す。プロフィール表そのものは公開しない。
alter table public.user_profiles
  add column if not exists profile_url text;

alter table public.market_assets
  add column if not exists creator_profile_url text;

update public.user_profiles
set profile_url = x_url
where nullif(btrim(coalesce(profile_url, '')), '') is null
  and nullif(btrim(coalesce(x_url, '')), '') is not null;

create or replace function public.market_set_asset_creator_display_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select
    coalesce(nullif(left(btrim(profile.nickname), 40), ''), 'PiXiEEDクリエイター'),
    nullif(left(btrim(coalesce(profile.profile_url, profile.x_url)), 200), '')
  into new.creator_display_name, new.creator_profile_url
  from public.user_profiles as profile
  where profile.id = new.creator_user_id;
  new.creator_display_name := coalesce(new.creator_display_name, 'PiXiEEDクリエイター');
  return new;
end;
$$;

create or replace function public.market_sync_creator_display_name_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text := coalesce(nullif(left(btrim(new.nickname), 40), ''), 'PiXiEEDクリエイター');
  v_profile_url text := nullif(left(btrim(coalesce(new.profile_url, new.x_url)), 200), '');
begin
  update public.market_assets
  set creator_display_name = v_display_name,
      creator_profile_url = v_profile_url,
      updated_at = timezone('utc', now())
  where creator_user_id = new.id
    and (
      creator_display_name is distinct from v_display_name
      or creator_profile_url is distinct from v_profile_url
    );
  return new;
end;
$$;

drop trigger if exists user_profiles_sync_market_creator_name on public.user_profiles;
create trigger user_profiles_sync_market_creator_name
after insert or update of nickname, profile_url, x_url on public.user_profiles
for each row execute function public.market_sync_creator_display_name_from_profile();

update public.market_assets as asset
set creator_display_name = coalesce(nullif(left(btrim(profile.nickname), 40), ''), 'PiXiEEDクリエイター'),
    creator_profile_url = nullif(left(btrim(coalesce(profile.profile_url, profile.x_url)), 200), ''),
    updated_at = timezone('utc', now())
from public.user_profiles as profile
where profile.id = asset.creator_user_id
  and (
    asset.creator_display_name is distinct from coalesce(nullif(left(btrim(profile.nickname), 40), ''), 'PiXiEEDクリエイター')
    or asset.creator_profile_url is distinct from nullif(left(btrim(coalesce(profile.profile_url, profile.x_url)), 200), '')
  );

create or replace function public.market_public_catalog_v1(input_limit integer default 120)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(catalog.asset order by catalog.published_at desc), '[]'::jsonb)
  from (
    select asset.published_at, jsonb_build_object(
      'id', asset.id, 'parent_asset_id', asset.parent_asset_id,
      'creator_display_name', asset.creator_display_name,
      'creator_profile_url', asset.creator_profile_url,
      'title', asset.title, 'description', asset.description,
      'sale_price_yen', asset.sale_price_yen, 'asset_format', asset.asset_format,
      'included_formats', asset.included_formats, 'ai_usage_status', asset.ai_usage_status,
      'tags', asset.tags, 'favorite_count', asset.favorite_count, 'derivative_count', asset.derivative_count,
      'limited_quantity', asset.limited_quantity, 'limited_sold_count', asset.limited_sold_count,
      'published_at', asset.published_at, 'source_kind', asset.source_kind,
      'verification_status', asset.verification_status, 'verification_level', asset.verification_level,
      'seller_identity_verified', asset.seller_identity_verified,
      'series', jsonb_build_object('required_option_price_yen', series.required_option_price_yen, 'derivative_sales_allowed', series.derivative_sales_allowed, 'inherited_terms', series.inherited_terms)
    ) as asset
    from public.market_assets asset join public.market_asset_series series on series.id = asset.series_id
    where asset.status = 'published' and series.status = 'published' and asset.withdrawn_at is null
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
    'id', asset.id, 'parent_asset_id', asset.parent_asset_id,
    'creator_display_name', asset.creator_display_name, 'creator_profile_url', asset.creator_profile_url,
    'title', asset.title, 'description', asset.description, 'sale_price_yen', asset.sale_price_yen,
    'asset_format', asset.asset_format, 'included_formats', asset.included_formats,
    'ai_usage_status', asset.ai_usage_status, 'tags', asset.tags, 'favorite_count', asset.favorite_count,
    'derivative_count', asset.derivative_count, 'limited_quantity', asset.limited_quantity,
    'limited_sold_count', asset.limited_sold_count, 'published_at', asset.published_at,
    'source_kind', asset.source_kind, 'verification_status', asset.verification_status,
    'verification_level', asset.verification_level, 'seller_identity_verified', asset.seller_identity_verified,
    'series', jsonb_build_object('required_option_price_yen', series.required_option_price_yen, 'derivative_sales_allowed', series.derivative_sales_allowed, 'inherited_terms', series.inherited_terms)
  )
  from public.market_assets asset join public.market_asset_series series on series.id = asset.series_id
  where asset.id = input_asset_id and asset.status = 'published' and series.status = 'published'
    and asset.withdrawn_at is null
    and (asset.limited_quantity is null or asset.limited_quantity <= 0 or coalesce(asset.limited_sold_count, 0) < asset.limited_quantity);
$$;

create or replace function public.market_public_seo_catalog_v1()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(catalog.asset order by catalog.published_at desc), '[]'::jsonb)
  from (
    select asset.published_at, jsonb_build_object(
      'id', asset.id, 'creator_display_name', asset.creator_display_name,
      'creator_profile_url', asset.creator_profile_url, 'title', asset.title,
      'description', asset.description, 'sale_price_yen', asset.sale_price_yen,
      'asset_format', asset.asset_format, 'included_formats', asset.included_formats,
      'tags', asset.tags, 'limited_quantity', asset.limited_quantity,
      'limited_sold_count', asset.limited_sold_count, 'published_at', asset.published_at,
      'series', jsonb_build_object('required_option_price_yen', series.required_option_price_yen, 'derivative_sales_allowed', series.derivative_sales_allowed, 'inherited_terms', series.inherited_terms)
    ) as asset
    from public.market_assets asset join public.market_asset_series series on series.id = asset.series_id
    where asset.status = 'published' and series.status = 'published' and asset.withdrawn_at is null
    order by asset.published_at desc nulls last
  ) catalog;
$$;

revoke all on function public.market_set_asset_creator_display_name() from public, anon, authenticated;
revoke all on function public.market_sync_creator_display_name_from_profile() from public, anon, authenticated;
revoke all on function public.market_public_catalog_v1(integer) from public, anon, authenticated;
revoke all on function public.market_public_asset_v1(uuid) from public, anon, authenticated;
revoke all on function public.market_public_seo_catalog_v1() from public, anon, authenticated;
grant execute on function public.market_public_catalog_v1(integer) to anon, authenticated;
grant execute on function public.market_public_asset_v1(uuid) to anon, authenticated;
grant execute on function public.market_public_seo_catalog_v1() to anon, authenticated;
