-- Public marketplace release: selling may start after email verification and
-- listing-level legal confirmation. Stripe Connect is required only to receive
-- a payout, not to submit or sell a reviewed listing.

create or replace function public.market_listing_is_enabled()
returns boolean language sql stable as $$ select true; $$;

create or replace function public.market_current_user_is_reviewer()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.market_staff_roles staff where staff.user_id = auth.uid() and staff.active and staff.role in ('reviewer', 'admin'));
$$;

create or replace function public.market_current_user_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.market_staff_roles staff where staff.user_id = auth.uid() and staff.active and staff.role = 'admin');
$$;

create or replace function public.market_current_user_can_sell()
returns boolean language sql stable security definer set search_path = public as $$
  select public.market_listing_is_enabled() and public.market_current_user_has_confirmed_identity();
$$;

drop policy if exists market_asset_series_read_published on public.market_asset_series;
create policy market_asset_series_read_published on public.market_asset_series for select to authenticated using (root_creator_user_id = auth.uid());
drop policy if exists market_assets_read_published_or_own on public.market_assets;
create policy market_assets_read_published_or_own on public.market_assets for select to authenticated using (creator_user_id = auth.uid());
drop policy if exists market_seller_profiles_read_own on public.market_seller_profiles;
create policy market_seller_profiles_read_own on public.market_seller_profiles for select to authenticated using (user_id = auth.uid());
drop policy if exists market_derivative_licenses_read_own on public.market_derivative_licenses;
create policy market_derivative_licenses_read_own on public.market_derivative_licenses for select to authenticated using (purchaser_user_id = auth.uid());
drop policy if exists market_purchases_read_own on public.market_purchases;
create policy market_purchases_read_own on public.market_purchases for select to authenticated using (buyer_user_id = auth.uid());
drop policy if exists market_royalty_ledger_read_own on public.market_royalty_ledger;
create policy market_royalty_ledger_read_own on public.market_royalty_ledger for select to authenticated using (recipient_user_id = auth.uid());
drop policy if exists market_seller_payout_accounts_read_own on public.market_seller_payout_accounts;
create policy market_seller_payout_accounts_read_own on public.market_seller_payout_accounts for select to authenticated using (user_id = auth.uid());
drop policy if exists market_download_events_read_own on public.market_download_events;
create policy market_download_events_read_own on public.market_download_events for select to authenticated using (buyer_user_id = auth.uid());
drop policy if exists market_payout_batches_read_own on public.market_payout_batches;
create policy market_payout_batches_read_own on public.market_payout_batches for select to authenticated using (recipient_user_id = auth.uid());
drop policy if exists market_payout_items_read_own on public.market_payout_items;
create policy market_payout_items_read_own on public.market_payout_items for select to authenticated using (exists (select 1 from public.market_payout_batches batch where batch.id = batch_id and batch.recipient_user_id = auth.uid()));

drop policy if exists market_private_upload_own on storage.objects;
create policy market_private_upload_own on storage.objects for insert to authenticated with check (bucket_id = 'market-private' and owner_id = auth.uid()::text and public.market_listing_is_enabled() and public.market_current_user_can_sell() and name like (auth.uid()::text || '/%'));
drop policy if exists market_private_read_own on storage.objects;
create policy market_private_read_own on storage.objects for select to authenticated using (bucket_id = 'market-private' and owner_id = auth.uid()::text);
drop policy if exists market_private_delete_own on storage.objects;
create policy market_private_delete_own on storage.objects for delete to authenticated using (bucket_id = 'market-private' and owner_id = auth.uid()::text);

create or replace function public.market_enforce_minimum_purchase_amount()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.purchase_kind = 'standard_use' and new.gross_amount_yen < 500 then raise exception 'market purchase amount must be at least 500 yen'; end if;
  return new;
end;
$$;
