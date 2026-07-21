-- Listings have one seller-entered price. License and sale options are included
-- terms and never add a buyer-facing charge.
create or replace function public.market_enforce_minimum_listing_price()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.sale_price_yen < 500 or mod(new.sale_price_yen, 100) <> 0 then
    raise exception 'market listing price must be at least 500 yen and use 100 yen increments';
  end if;
  return new;
end;
$$;

alter table public.market_assets drop constraint if exists market_assets_published_minimum_price;
alter table public.market_assets add constraint market_assets_published_minimum_price
  check (status <> 'published' or sale_price_yen >= 500) not valid;

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

create or replace function public.market_create_root_asset_v8(
  input_title text, input_description text, input_sale_price_yen integer,
  input_derivative_sales_allowed boolean, input_source_kind text, input_source_sha256 text,
  input_asset_formats text[], input_selected_option_ids text[], input_option_prices jsonb,
  input_provenance_manifest jsonb, input_inherited_terms jsonb, input_prohibited_uses jsonb,
  input_change_summary jsonb, input_terms_version text, input_privacy_version text,
  input_ai_usage_status text, input_terms_confirmed boolean, input_privacy_confirmed boolean,
  input_original_work_confirmed boolean, input_custom_options jsonb default '[]'::jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_asset_id uuid;
  v_provenance jsonb := coalesce(input_provenance_manifest, '{}'::jsonb);
begin
  if coalesce(input_sale_price_yen, 0) < 500 or mod(input_sale_price_yen, 100) <> 0 then
    raise exception 'sale price must be at least 500 yen and use 100 yen increments';
  end if;
  if jsonb_typeof(coalesce(input_option_prices, '{}'::jsonb)) <> 'object'
     or jsonb_object_length(coalesce(input_option_prices, '{}'::jsonb)) <> 0 then
    raise exception 'license options are included in the listing price and cannot have separate prices';
  end if;
  if jsonb_typeof(coalesce(input_custom_options, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(input_custom_options, '[]'::jsonb)) <> 0 then
    raise exception 'seller-priced custom options are not available';
  end if;
  if exists (
    select 1 from public.market_license_options
    where id = any(coalesce(input_selected_option_ids, array[]::text[]))
      and (not active or minimum_price_yen <> 0)
  ) then
    raise exception 'selected options must be included terms';
  end if;
  if coalesce((v_provenance #>> '{limited_sale,enabled}')::boolean, false) then
    -- v7's legacy storage guard requires a positive placeholder. The listing
    -- price remains unchanged and the persisted public term is reset to zero.
    v_provenance := jsonb_set(v_provenance, '{limited_sale,option_price_yen}', '100'::jsonb, true);
  end if;
  v_asset_id := public.market_create_root_asset_v7(
    input_title, input_description, input_sale_price_yen, input_derivative_sales_allowed,
    input_source_kind, input_source_sha256, input_asset_formats, input_selected_option_ids,
    '{}'::jsonb, v_provenance, input_inherited_terms, input_prohibited_uses,
    input_change_summary, input_terms_version, input_privacy_version, input_ai_usage_status,
    input_terms_confirmed, input_privacy_confirmed, input_original_work_confirmed, '[]'::jsonb
  );
  if coalesce((input_provenance_manifest #>> '{limited_sale,enabled}')::boolean, false) then
    update public.market_assets
    set provenance_manifest = jsonb_set(provenance_manifest, '{limited_sale,option_price_yen}', '0'::jsonb, true)
    where id = v_asset_id;
  end if;
  return v_asset_id;
end;
$$;

create or replace function public.market_create_derivative_draft_v5(
  input_source_asset_id uuid, input_derivative_license_id uuid, input_title text,
  input_description text, input_seller_price_yen integer, input_source_kind text,
  input_source_sha256 text, input_asset_formats text[], input_provenance_manifest jsonb,
  input_change_summary jsonb, input_terms_version text, input_privacy_version text,
  input_ai_usage_status text, input_terms_confirmed boolean, input_privacy_confirmed boolean
)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if coalesce(input_seller_price_yen, 0) < 500 or mod(input_seller_price_yen, 100) <> 0 then
    raise exception 'derivative sale price must be at least 500 yen and use 100 yen increments';
  end if;
  return public.market_create_derivative_draft_v4(
    input_source_asset_id, input_derivative_license_id, input_title, input_description,
    input_seller_price_yen, input_source_kind, input_source_sha256, input_asset_formats,
    input_provenance_manifest, input_change_summary, input_terms_version,
    input_privacy_version, input_ai_usage_status, input_terms_confirmed, input_privacy_confirmed
  );
end;
$$;

create or replace function public.market_set_listing_limited_sale(
  input_asset_id uuid, input_enabled boolean, input_quantity integer default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_quantity integer;
begin
  if not public.market_current_user_can_sell() then raise exception 'confirmed account required'; end if;
  if coalesce(input_enabled, false) then
    v_quantity := input_quantity;
    if v_quantity is null or v_quantity not between 1 and 100000 then
      raise exception 'limited quantity must be between 1 and 100000';
    end if;
  end if;
  update public.market_assets
  set limited_quantity = v_quantity, limited_sold_count = 0, updated_at = timezone('utc', now())
  where id = input_asset_id and creator_user_id = auth.uid() and status = 'draft';
  if not found then raise exception 'editable draft not found'; end if;
  return jsonb_build_object('enabled', v_quantity is not null, 'quantity', v_quantity, 'option_price_yen', 0);
end;
$$;

revoke all on function public.market_create_root_asset_v7(text, text, integer, boolean, text, text, text[], text[], jsonb, jsonb, jsonb, jsonb, jsonb, text, text, text, boolean, boolean, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.market_create_derivative_draft_v4(uuid, uuid, text, text, integer, text, text, text[], jsonb, jsonb, text, text, text, boolean, boolean) from public, anon, authenticated;
revoke all on function public.market_create_root_asset_v8(text, text, integer, boolean, text, text, text[], text[], jsonb, jsonb, jsonb, jsonb, jsonb, text, text, text, boolean, boolean, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.market_create_derivative_draft_v5(uuid, uuid, text, text, integer, text, text, text[], jsonb, jsonb, text, text, text, boolean, boolean) from public, anon, authenticated;
revoke all on function public.market_set_listing_limited_sale(uuid, boolean, integer) from public, anon, authenticated;
grant execute on function public.market_create_root_asset_v8(text, text, integer, boolean, text, text, text[], text[], jsonb, jsonb, jsonb, jsonb, jsonb, text, text, text, boolean, boolean, boolean, jsonb) to authenticated;
grant execute on function public.market_create_derivative_draft_v5(uuid, uuid, text, text, integer, text, text, text[], jsonb, jsonb, text, text, text, boolean, boolean) to authenticated;
grant execute on function public.market_set_listing_limited_sale(uuid, boolean, integer) to authenticated;
