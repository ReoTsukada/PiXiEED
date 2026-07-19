begin;

-- Public launch: every confirmed, non-anonymous account may list and buy.
-- Stripe Connect remains a payout requirement, not a listing prerequisite.
create or replace function public.market_listing_is_enabled()
returns boolean language sql stable as $$ select true; $$;

create or replace function public.market_current_user_is_reviewer()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.market_staff_roles staff
    where staff.user_id = auth.uid() and staff.active and staff.role in ('reviewer', 'admin')
  );
$$;

create or replace function public.market_current_user_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.market_staff_roles staff
    where staff.user_id = auth.uid() and staff.active and staff.role = 'admin'
  );
$$;

create or replace function public.market_current_user_can_sell()
returns boolean language sql stable security definer set search_path = public as $$
  select public.market_listing_is_enabled() and public.market_current_user_has_confirmed_identity();
$$;

revoke all on function public.market_listing_is_enabled() from public, anon, authenticated;
revoke all on function public.market_current_user_is_reviewer() from public, anon, authenticated;
revoke all on function public.market_current_user_is_admin() from public, anon, authenticated;
revoke all on function public.market_current_user_can_sell() from public, anon, authenticated;
grant execute on function public.market_listing_is_enabled() to authenticated;
grant execute on function public.market_current_user_is_reviewer() to authenticated;
grant execute on function public.market_current_user_is_admin() to authenticated;
grant execute on function public.market_current_user_can_sell() to authenticated;

drop trigger if exists market_assets_dev_write_gate on public.market_assets;
drop trigger if exists market_seller_profiles_dev_write_gate on public.market_seller_profiles;
drop function if exists public.market_enforce_dev_listing_write();
drop function if exists public.market_enforce_dev_seller_profile_write();

drop policy if exists market_asset_series_read_published on public.market_asset_series;
create policy market_asset_series_read_published on public.market_asset_series
for select to authenticated using (root_creator_user_id = auth.uid());
drop policy if exists market_assets_read_published_or_own on public.market_assets;
create policy market_assets_read_published_or_own on public.market_assets
for select to authenticated using (creator_user_id = auth.uid());
drop policy if exists market_seller_profiles_read_own on public.market_seller_profiles;
create policy market_seller_profiles_read_own on public.market_seller_profiles
for select to authenticated using (user_id = auth.uid());
drop policy if exists market_derivative_licenses_read_own on public.market_derivative_licenses;
create policy market_derivative_licenses_read_own on public.market_derivative_licenses
for select to authenticated using (purchaser_user_id = auth.uid());
drop policy if exists market_purchases_read_own on public.market_purchases;
create policy market_purchases_read_own on public.market_purchases
for select to authenticated using (buyer_user_id = auth.uid());
drop policy if exists market_royalty_ledger_read_own on public.market_royalty_ledger;
create policy market_royalty_ledger_read_own on public.market_royalty_ledger
for select to authenticated using (recipient_user_id = auth.uid());
drop policy if exists market_seller_payout_accounts_read_own on public.market_seller_payout_accounts;
create policy market_seller_payout_accounts_read_own on public.market_seller_payout_accounts
for select to authenticated using (user_id = auth.uid());
drop policy if exists market_download_events_read_own on public.market_download_events;
create policy market_download_events_read_own on public.market_download_events
for select to authenticated using (buyer_user_id = auth.uid());
drop policy if exists market_payout_batches_read_own on public.market_payout_batches;
create policy market_payout_batches_read_own on public.market_payout_batches
for select to authenticated using (recipient_user_id = auth.uid());
drop policy if exists market_payout_items_read_own on public.market_payout_items;
create policy market_payout_items_read_own on public.market_payout_items
for select to authenticated using (exists (
  select 1 from public.market_payout_batches batch
  where batch.id = market_payout_items.batch_id and batch.recipient_user_id = auth.uid()
));

drop policy if exists market_asset_favorites_read_own on public.market_asset_favorites;
create policy market_asset_favorites_read_own on public.market_asset_favorites
for select to authenticated using (user_id = auth.uid());
drop policy if exists market_asset_favorites_insert_own on public.market_asset_favorites;
create policy market_asset_favorites_insert_own on public.market_asset_favorites
for insert to authenticated with check (
  user_id = auth.uid() and public.market_current_user_has_confirmed_identity()
  and exists (select 1 from public.market_assets asset where asset.id = market_asset_favorites.asset_id and asset.status = 'published')
);
drop policy if exists market_asset_favorites_delete_own on public.market_asset_favorites;
create policy market_asset_favorites_delete_own on public.market_asset_favorites
for delete to authenticated using (user_id = auth.uid() and public.market_current_user_has_confirmed_identity());

drop policy if exists market_private_upload_own on storage.objects;
create policy market_private_upload_own on storage.objects for insert to authenticated
with check (bucket_id = 'market-private' and owner_id = auth.uid()::text
  and public.market_current_user_can_sell() and name like (auth.uid()::text || '/%'));
drop policy if exists market_private_read_own on storage.objects;
create policy market_private_read_own on storage.objects for select to authenticated
using (bucket_id = 'market-private' and owner_id = auth.uid()::text);
drop policy if exists market_private_delete_own on storage.objects;
create policy market_private_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'market-private' and owner_id = auth.uid()::text);

create or replace function public.market_enforce_minimum_purchase_amount()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'granted' then
    if new.payment_provider <> 'admin_grant' or new.gross_amount_yen <> 0
       or new.processor_fee_yen <> 0 or new.platform_fee_yen <> 0
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
revoke all on function public.market_enforce_minimum_purchase_amount() from public, anon, authenticated;

-- Root listings may add seller-defined options. These options are snapshotted
-- into the series terms and inherited by derivatives like the fixed catalog options.
create or replace function public.market_create_root_asset_v6(
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
  input_privacy_confirmed boolean,
  input_original_work_confirmed boolean,
  input_custom_options jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_id uuid;
  v_series_id uuid;
  v_existing_total integer;
  v_custom_total integer := 0;
  v_custom_options jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(coalesce(input_custom_options, '[]'::jsonb)) <> 'array' then
    raise exception 'custom options must be an array';
  end if;
  if jsonb_array_length(coalesce(input_custom_options, '[]'::jsonb)) > 10 then
    raise exception 'up to 10 custom options are allowed';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(input_custom_options, '[]'::jsonb)) option
    where char_length(btrim(coalesce(option ->> 'label', ''))) not between 1 and 50
      or char_length(btrim(coalesce(option ->> 'description', ''))) > 200
      or case
        when coalesce(option ->> 'price_yen', '') ~ '^[0-9]+$'
          then (option ->> 'price_yen')::numeric not between 100 and 10000000
        else true
      end
  ) then
    raise exception 'invalid custom option';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(input_custom_options, '[]'::jsonb)) option
    group by lower(btrim(option ->> 'label')) having count(*) > 1
  ) then
    raise exception 'duplicate custom option labels are not allowed';
  end if;

  select coalesce(sum((option ->> 'price_yen')::integer), 0),
    coalesce(jsonb_agg(jsonb_build_object(
      'id', 'custom-' || ordinal::text,
      'label', btrim(option ->> 'label'),
      'description', btrim(coalesce(option ->> 'description', '')),
      'minimum_price_yen', (option ->> 'price_yen')::integer,
      'price_yen', (option ->> 'price_yen')::integer,
      'custom', true
    ) order by ordinal), '[]'::jsonb)
  into v_custom_total, v_custom_options
  from jsonb_array_elements(coalesce(input_custom_options, '[]'::jsonb)) with ordinality as valueset(option, ordinal);

  v_asset_id := public.market_create_root_asset_v5(
    input_title, input_description, input_sale_price_yen,
    input_derivative_sales_allowed, input_source_kind, input_source_sha256,
    input_asset_formats, input_selected_option_ids, input_option_prices,
    input_provenance_manifest, input_inherited_terms, input_prohibited_uses,
    input_change_summary, input_terms_version, input_privacy_version,
    input_ai_usage_status, input_terms_confirmed, input_privacy_confirmed,
    input_original_work_confirmed
  );

  select asset.series_id, asset.sale_price_yen into v_series_id, v_existing_total
  from public.market_assets asset where asset.id = v_asset_id for update;
  if v_existing_total + v_custom_total > 99999999 then
    raise exception 'purchase price must not exceed 99999999 yen';
  end if;

  update public.market_assets
  set sale_price_yen = sale_price_yen + v_custom_total,
      updated_at = timezone('utc', now())
  where id = v_asset_id;
  update public.market_asset_series
  set required_option_price_yen = required_option_price_yen + v_custom_total,
      inherited_terms = jsonb_set(
        inherited_terms,
        '{license_options}',
        coalesce(inherited_terms -> 'license_options', '[]'::jsonb) || v_custom_options,
        true
      ),
      updated_at = timezone('utc', now())
  where id = v_series_id;

  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'listing_custom_options_added', 'market_asset', v_asset_id::text,
    jsonb_build_object('custom_options', v_custom_options, 'custom_option_total_yen', v_custom_total));
  return v_asset_id;
end;
$$;

revoke all on function public.market_create_root_asset_v6(text, text, integer, boolean, text, text, text[], text[], jsonb, jsonb, jsonb, jsonb, jsonb, text, text, text, boolean, boolean, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.market_create_root_asset_v6(text, text, integer, boolean, text, text, text[], text[], jsonb, jsonb, jsonb, jsonb, jsonb, text, text, text, boolean, boolean, boolean, jsonb)
  to authenticated;

create or replace function public.market_set_listing_tags(input_asset_id uuid, input_tags text[])
returns text[]
language plpgsql security definer set search_path = public
as $$
declare
  v_raw_tag text;
  v_tag text;
  v_tags text[] := array[]::text[];
begin
  if not public.market_current_user_can_sell() then raise exception 'confirmed account required'; end if;
  if coalesce(cardinality(input_tags), 0) > 5 then raise exception 'up to 5 tags are allowed'; end if;
  foreach v_raw_tag in array coalesce(input_tags, array[]::text[]) loop
    v_tag := regexp_replace(btrim(regexp_replace(coalesce(v_raw_tag, ''), '^[#＃]+', '')), '[[:space:]]+', ' ', 'g');
    if v_tag = '' then continue; end if;
    if char_length(v_tag) > 24 then raise exception 'tag is too long'; end if;
    if not exists (select 1 from unnest(v_tags) item(value) where lower(value) = lower(v_tag)) then
      v_tags := array_append(v_tags, v_tag);
    end if;
    if cardinality(v_tags) > 5 then raise exception 'up to 5 tags are allowed'; end if;
  end loop;
  update public.market_assets set tags = v_tags, updated_at = timezone('utc', now())
  where id = input_asset_id and creator_user_id = auth.uid() and status = 'draft';
  if not found then raise exception 'editable draft not found'; end if;
  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'listing_tags_updated', 'market_asset', input_asset_id::text, jsonb_build_object('tags', v_tags));
  return v_tags;
end;
$$;
revoke all on function public.market_set_listing_tags(uuid, text[]) from public, anon, authenticated;
grant execute on function public.market_set_listing_tags(uuid, text[]) to authenticated;

-- Remove the last DEV-only checks from the owner's listing actions.
create or replace function public.market_withdraw_my_listing_v1(input_asset_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_asset public.market_assets%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select * into v_asset from public.market_assets
  where id = input_asset_id and creator_user_id = v_user_id for update;
  if not found then raise exception 'owned market asset not found'; end if;
  if v_asset.status <> 'published' then raise exception 'only published listings can be withdrawn'; end if;
  if v_asset.withdrawn_at is not null then
    return jsonb_build_object('asset_id', v_asset.id, 'withdrawn_at', v_asset.withdrawn_at, 'sold_out', true);
  end if;
  if exists (select 1 from public.market_purchases purchase
    where purchase.asset_id = v_asset.id and purchase.status = 'pending'
      and purchase.provider_checkout_session_id is not null
      and coalesce(purchase.expires_at, purchase.created_at + interval '30 minutes') > v_now) then
    raise exception 'active checkout must finish or expire before withdrawal';
  end if;
  update public.market_purchases set status = 'cancelled', updated_at = v_now
  where asset_id = v_asset.id and status = 'pending'
    and (provider_checkout_session_id is null or coalesce(expires_at, created_at + interval '30 minutes') <= v_now);
  update public.market_assets set withdrawn_at = v_now, updated_at = v_now where id = v_asset.id;
  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (v_user_id, 'listing_withdrawn', 'market_asset', v_asset.id::text,
    jsonb_build_object('withdrawn_at', v_now, 'public_status', 'sold_out', 'lineage_preserved', true, 'rewards_preserved', true));
  return jsonb_build_object('asset_id', v_asset.id, 'withdrawn_at', v_now, 'sold_out', true);
end;
$$;
revoke all on function public.market_withdraw_my_listing_v1(uuid) from public, anon;
grant execute on function public.market_withdraw_my_listing_v1(uuid) to authenticated;

create or replace function public.market_my_listings_v1()
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', asset.id, 'title', asset.title, 'status', asset.status,
    'sale_price_yen', asset.sale_price_yen, 'asset_format', asset.asset_format,
    'included_formats', asset.included_formats, 'withdrawn_at', asset.withdrawn_at,
    'preview_url', case when asset.status = 'published' and asset.preview_object_path ~ '^https://' then asset.preview_object_path else null end,
    'published_at', asset.published_at, 'created_at', asset.created_at,
    'updated_at', asset.updated_at
  ) order by asset.created_at desc), '[]'::jsonb) into v_result
  from (select own.* from public.market_assets own
    where own.creator_user_id = v_user_id order by own.created_at desc limit 100) asset;
  return v_result;
end;
$$;
revoke all on function public.market_my_listings_v1() from public, anon;
grant execute on function public.market_my_listings_v1() to authenticated;

insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
values (null, 'market_public_launch_enabled', 'market', 'public-launch-20260719',
  jsonb_build_object('confirmed_accounts_can_list', true, 'dev_gate_removed', true, 'local_fixtures_removed', true));

commit;
