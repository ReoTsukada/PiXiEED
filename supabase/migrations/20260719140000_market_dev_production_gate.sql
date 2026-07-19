-- Production beta gate. Public catalog browsing remains available, while all
-- seller, purchase, delivery, payout and staff operations stay limited to the
-- confirmed PiXiEED DEV account until the marketplace is released publicly.

create or replace function public.market_listing_is_enabled()
returns boolean
language sql
stable
as $$
  select public.market_current_user_is_dev();
$$;

create or replace function public.market_current_user_is_reviewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.market_current_user_is_dev() and exists (
    select 1
    from public.market_staff_roles staff
    where staff.user_id = auth.uid()
      and staff.active
      and staff.role in ('reviewer', 'admin')
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
    select 1
    from public.market_staff_roles staff
    where staff.user_id = auth.uid()
      and staff.active
      and staff.role = 'admin'
  );
$$;

create or replace function public.market_current_user_can_sell()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.market_listing_is_enabled()
    and public.market_current_user_is_dev()
    and public.market_current_user_has_confirmed_identity();
$$;

revoke all on function public.market_listing_is_enabled() from public, anon, authenticated;
revoke all on function public.market_current_user_is_reviewer() from public, anon, authenticated;
revoke all on function public.market_current_user_is_admin() from public, anon, authenticated;
revoke all on function public.market_current_user_can_sell() from public, anon, authenticated;
grant execute on function public.market_listing_is_enabled() to authenticated;
grant execute on function public.market_current_user_is_reviewer() to authenticated;
grant execute on function public.market_current_user_is_admin() to authenticated;
grant execute on function public.market_current_user_can_sell() to authenticated;

drop policy if exists market_asset_series_read_published on public.market_asset_series;
create policy market_asset_series_read_published on public.market_asset_series
for select to authenticated
using (public.market_current_user_is_dev() and root_creator_user_id = auth.uid());

drop policy if exists market_assets_read_published_or_own on public.market_assets;
create policy market_assets_read_published_or_own on public.market_assets
for select to authenticated
using (public.market_current_user_is_dev() and creator_user_id = auth.uid());

drop policy if exists market_seller_profiles_read_own on public.market_seller_profiles;
create policy market_seller_profiles_read_own on public.market_seller_profiles
for select to authenticated
using (public.market_current_user_is_dev() and user_id = auth.uid());

drop policy if exists market_derivative_licenses_read_own on public.market_derivative_licenses;
create policy market_derivative_licenses_read_own on public.market_derivative_licenses
for select to authenticated
using (public.market_current_user_is_dev() and purchaser_user_id = auth.uid());

drop policy if exists market_purchases_read_own on public.market_purchases;
create policy market_purchases_read_own on public.market_purchases
for select to authenticated
using (public.market_current_user_is_dev() and buyer_user_id = auth.uid());

drop policy if exists market_royalty_ledger_read_own on public.market_royalty_ledger;
create policy market_royalty_ledger_read_own on public.market_royalty_ledger
for select to authenticated
using (public.market_current_user_is_dev() and recipient_user_id = auth.uid());

drop policy if exists market_seller_payout_accounts_read_own on public.market_seller_payout_accounts;
create policy market_seller_payout_accounts_read_own on public.market_seller_payout_accounts
for select to authenticated
using (public.market_current_user_is_dev() and user_id = auth.uid());

drop policy if exists market_download_events_read_own on public.market_download_events;
create policy market_download_events_read_own on public.market_download_events
for select to authenticated
using (public.market_current_user_is_dev() and buyer_user_id = auth.uid());

drop policy if exists market_payout_batches_read_own on public.market_payout_batches;
create policy market_payout_batches_read_own on public.market_payout_batches
for select to authenticated
using (public.market_current_user_is_dev() and recipient_user_id = auth.uid());

drop policy if exists market_payout_items_read_own on public.market_payout_items;
create policy market_payout_items_read_own on public.market_payout_items
for select to authenticated
using (
  public.market_current_user_is_dev() and exists (
    select 1
    from public.market_payout_batches batch
    where batch.id = market_payout_items.batch_id
      and batch.recipient_user_id = auth.uid()
  )
);

drop policy if exists market_private_upload_own on storage.objects;
create policy market_private_upload_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'market-private'
  and owner_id = auth.uid()::text
  and public.market_current_user_can_sell()
  and name like (auth.uid()::text || '/%')
);

drop policy if exists market_private_read_own on storage.objects;
create policy market_private_read_own on storage.objects
for select to authenticated
using (
  bucket_id = 'market-private'
  and owner_id = auth.uid()::text
  and public.market_current_user_is_dev()
);

drop policy if exists market_private_delete_own on storage.objects;
create policy market_private_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id = 'market-private'
  and owner_id = auth.uid()::text
  and public.market_current_user_is_dev()
);

create or replace function public.market_enforce_dev_listing_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated')
     and not public.market_current_user_is_dev() then
    raise exception 'market DEV access required';
  end if;
  return new;
end;
$$;

drop trigger if exists market_assets_dev_write_gate on public.market_assets;
create trigger market_assets_dev_write_gate
before insert or update on public.market_assets
for each row execute function public.market_enforce_dev_listing_write();

create or replace function public.market_enforce_dev_seller_profile_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated')
     and not public.market_current_user_is_dev() then
    raise exception 'market DEV access required';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists market_seller_profiles_dev_write_gate on public.market_seller_profiles;
create trigger market_seller_profiles_dev_write_gate
before insert or update or delete on public.market_seller_profiles
for each row execute function public.market_enforce_dev_seller_profile_write();

create or replace function public.market_enforce_minimum_purchase_amount()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated')
     and not public.market_current_user_is_dev() then
    raise exception 'market DEV access required';
  end if;
  if new.status = 'granted' then
    if new.payment_provider <> 'admin_grant'
       or new.gross_amount_yen <> 0
       or new.processor_fee_yen <> 0
       or new.platform_fee_yen <> 0
       or new.distributable_amount_yen <> 0 then
      raise exception 'invalid admin market grant';
    end if;
    return new;
  end if;
  if new.purchase_kind = 'standard_use' and new.gross_amount_yen < 500 then
    raise exception 'market purchase amount must be at least 500 yen';
  end if;
  return new;
end;
$$;

revoke all on function public.market_enforce_dev_listing_write() from public, anon, authenticated;
revoke all on function public.market_enforce_dev_seller_profile_write() from public, anon, authenticated;
revoke all on function public.market_enforce_minimum_purchase_amount() from public, anon, authenticated;

