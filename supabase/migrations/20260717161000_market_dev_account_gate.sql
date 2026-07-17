-- Public read-only market beta. Published listings may be browsed by anyone.
-- Test fixtures stay limited to the confirmed DEV account, while listing,
-- seller onboarding, review and purchase operations remain locked.

create or replace function public.market_current_user_is_dev()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users as users
    where users.id = auth.uid()
      and users.email_confirmed_at is not null
      and md5(lower(btrim(users.email))) = '41c3496ddd732f01ec22f1dd6c405e13'
  );
$$;

revoke all on function public.market_current_user_is_dev() from public, anon, authenticated;
grant execute on function public.market_current_user_is_dev() to authenticated;

create or replace function public.market_current_user_has_confirmed_identity()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and lower(coalesce(auth.jwt() ->> 'is_anonymous', 'false')) not in ('true', 't', '1')
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', '') <> 'anonymous'
    and exists (
      select 1 from auth.users as users
      where users.id = auth.uid() and users.email_confirmed_at is not null
    );
$$;

create or replace function public.market_current_user_is_reviewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.market_current_user_is_dev() and exists (
    select 1 from public.market_staff_roles as staff
    where staff.user_id = auth.uid() and staff.active and staff.role in ('reviewer', 'admin')
  );
$$;

create or replace function public.market_current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.market_current_user_is_dev() and exists (
    select 1 from public.market_staff_roles as staff
    where staff.user_id = auth.uid() and staff.active and staff.role = 'admin'
  );
$$;

create or replace function public.market_listing_is_enabled()
returns boolean
language sql
stable
as $$
  select false;
$$;

create or replace function public.market_current_user_can_sell()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.market_listing_is_enabled()
    and public.market_current_user_has_confirmed_identity()
    and public.market_current_session_has_mfa()
    and exists (
      select 1
      from public.market_seller_profiles seller
      join public.market_seller_payout_accounts payout on payout.user_id = seller.user_id
      where seller.user_id = auth.uid()
        and seller.seller_status = 'verified'
        and seller.identity_status = 'verified'
        and seller.terms_accepted_at is not null
        and seller.contact_registered_at is not null
        and seller.mfa_confirmed_at is not null
        and payout.provider = 'stripe'
        and payout.onboarding_status = 'verified'
        and payout.details_submitted
        and payout.payouts_enabled
    );
$$;

revoke all on function public.market_current_user_has_confirmed_identity() from public, anon, authenticated;
revoke all on function public.market_current_user_is_reviewer() from public, anon, authenticated;
revoke all on function public.market_current_user_is_admin() from public, anon, authenticated;
revoke all on function public.market_current_user_can_sell() from public, anon, authenticated;
revoke all on function public.market_listing_is_enabled() from public, anon, authenticated;
grant execute on function public.market_current_user_has_confirmed_identity() to authenticated;
grant execute on function public.market_current_user_is_reviewer() to authenticated;
grant execute on function public.market_current_user_is_admin() to authenticated;
grant execute on function public.market_current_user_can_sell() to authenticated;
grant execute on function public.market_listing_is_enabled() to authenticated;

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

create or replace function public.market_published_asset_exists(input_asset_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.market_assets asset
    where asset.id = input_asset_id and asset.status = 'published'
  );
$$;

revoke all on function public.market_public_catalog_v1(integer) from public, anon, authenticated;
revoke all on function public.market_public_asset_v1(uuid) from public, anon, authenticated;
revoke all on function public.market_published_asset_exists(uuid) from public, anon, authenticated;
grant execute on function public.market_public_catalog_v1(integer) to anon, authenticated;
grant execute on function public.market_public_asset_v1(uuid) to anon, authenticated;
grant execute on function public.market_published_asset_exists(uuid) to authenticated;

drop policy if exists market_asset_series_read_published on public.market_asset_series;
create policy market_asset_series_read_published on public.market_asset_series
for select to authenticated
using (public.market_current_user_is_dev() and root_creator_user_id = auth.uid());

drop policy if exists market_assets_read_published_or_own on public.market_assets;
create policy market_assets_read_published_or_own on public.market_assets
for select to authenticated
using (public.market_current_user_is_dev() and creator_user_id = auth.uid());

drop policy if exists market_asset_formats_read_active on public.market_asset_formats;
create policy market_asset_formats_read_active on public.market_asset_formats
for select to anon, authenticated using (active);

drop policy if exists market_license_options_read_active on public.market_license_options;
create policy market_license_options_read_active on public.market_license_options
for select to anon, authenticated using (active);

drop policy if exists market_seller_profiles_read_own on public.market_seller_profiles;
create policy market_seller_profiles_read_own on public.market_seller_profiles
for select to authenticated using (user_id = auth.uid() and public.market_current_user_is_dev());

drop policy if exists market_derivative_licenses_read_own on public.market_derivative_licenses;
create policy market_derivative_licenses_read_own on public.market_derivative_licenses
for select to authenticated using (purchaser_user_id = auth.uid() and public.market_current_user_is_dev());

drop policy if exists market_purchases_read_own on public.market_purchases;
create policy market_purchases_read_own on public.market_purchases
for select to authenticated using (buyer_user_id = auth.uid() and public.market_current_user_is_dev());

drop policy if exists market_royalty_ledger_read_own on public.market_royalty_ledger;
create policy market_royalty_ledger_read_own on public.market_royalty_ledger
for select to authenticated using (recipient_user_id = auth.uid() and public.market_current_user_is_dev());

drop policy if exists market_seller_payout_accounts_read_own on public.market_seller_payout_accounts;
create policy market_seller_payout_accounts_read_own on public.market_seller_payout_accounts
for select to authenticated using (user_id = auth.uid() and public.market_current_user_is_dev());

drop policy if exists market_download_events_read_own on public.market_download_events;
create policy market_download_events_read_own on public.market_download_events
for select to authenticated using (buyer_user_id = auth.uid() and public.market_current_user_is_dev());

drop policy if exists market_payout_batches_read_own on public.market_payout_batches;
create policy market_payout_batches_read_own on public.market_payout_batches
for select to authenticated using (recipient_user_id = auth.uid() and public.market_current_user_is_dev());

drop policy if exists market_payout_items_read_own on public.market_payout_items;
create policy market_payout_items_read_own on public.market_payout_items
for select to authenticated using (
  public.market_current_user_is_dev() and exists (
    select 1 from public.market_payout_batches batch
    where batch.id = market_payout_items.batch_id and batch.recipient_user_id = auth.uid()
  )
);

drop policy if exists market_asset_favorites_read_own on public.market_asset_favorites;
create policy market_asset_favorites_read_own on public.market_asset_favorites
for select to authenticated using (user_id = auth.uid());

drop policy if exists market_asset_favorites_insert_own on public.market_asset_favorites;
create policy market_asset_favorites_insert_own on public.market_asset_favorites
for insert to authenticated with check (
  user_id = auth.uid() and public.market_current_user_has_confirmed_identity()
  and public.market_published_asset_exists(market_asset_favorites.asset_id)
);

drop policy if exists market_asset_favorites_delete_own on public.market_asset_favorites;
create policy market_asset_favorites_delete_own on public.market_asset_favorites
for delete to authenticated using (user_id = auth.uid() and public.market_current_user_has_confirmed_identity());

drop policy if exists market_private_upload_own on storage.objects;
create policy market_private_upload_own on storage.objects for insert to authenticated
with check (
  bucket_id = 'market-private' and owner_id = auth.uid()::text
  and public.market_listing_is_enabled()
  and public.market_current_user_is_dev() and public.market_current_user_can_sell()
  and name like (auth.uid()::text || '/%')
);

drop policy if exists market_private_read_own on storage.objects;
create policy market_private_read_own on storage.objects for select to authenticated
using (bucket_id = 'market-private' and owner_id = auth.uid()::text and public.market_current_user_is_dev());

drop policy if exists market_private_delete_own on storage.objects;
create policy market_private_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'market-private' and owner_id = auth.uid()::text and public.market_current_user_is_dev());

create or replace function public.market_enforce_dev_listing_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.market_listing_is_enabled() then
    raise exception 'market listing is not available';
  end if;
  return new;
end;
$$;

drop trigger if exists market_assets_dev_write_gate on public.market_assets;
create trigger market_assets_dev_write_gate
before insert or update on public.market_assets
for each row execute function public.market_enforce_dev_listing_write();

create or replace function public.market_enforce_minimum_purchase_amount()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.market_current_user_is_dev() then
    raise exception 'market DEV access required';
  end if;
  if new.purchase_kind = 'standard_use' and new.gross_amount_yen < 500 then
    raise exception 'market purchase amount must be at least 500 yen';
  end if;
  return new;
end;
$$;

revoke all on public.market_asset_series, public.market_assets from public, anon, authenticated;
grant select on public.market_asset_series, public.market_assets to authenticated;
grant select on public.market_asset_formats, public.market_license_options to anon, authenticated;
