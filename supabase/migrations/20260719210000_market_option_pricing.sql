begin;

-- Paid listings and paid options use JPY 100 as the common floor and step.
-- Derivative permission remains the only zero-yen option.
create or replace function public.market_enforce_minimum_listing_price()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.sale_price_yen < 100 then
    raise exception 'market listing price must be at least 100 yen';
  end if;
  -- Existing series terms are immutable and may contain an older non-step
  -- inherited amount. Enforce the new step at the root-listing boundary;
  -- derivatives still inherit their historical terms unchanged.
  if new.parent_asset_id is null and mod(new.sale_price_yen, 100) <> 0 then
    raise exception 'market listing price must be in 100 yen increments';
  end if;
  return new;
end;
$$;

alter table public.market_assets drop constraint if exists market_assets_published_minimum_price;
alter table public.market_assets add constraint market_assets_published_minimum_price
  check (status <> 'published' or sale_price_yen >= 100) not valid;

alter table public.market_assets drop constraint if exists market_assets_limited_minimum_price;
alter table public.market_assets add constraint market_assets_limited_minimum_price
  check (limited_quantity is null or sale_price_yen >= 100) not valid;

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
  if new.purchase_kind = 'standard_use' and new.gross_amount_yen < 100 then
    raise exception 'market purchase amount must be at least 100 yen';
  end if;
  return new;
end;
$$;
revoke all on function public.market_enforce_minimum_purchase_amount() from public, anon, authenticated;

create or replace function public.market_set_listing_limited_sale(
  input_asset_id uuid,
  input_enabled boolean,
  input_quantity integer default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_asset public.market_assets%rowtype;
  v_quantity integer;
  v_option_price integer;
begin
  if not public.market_current_user_can_sell() then raise exception 'confirmed account required'; end if;
  select * into v_asset from public.market_assets
  where id = input_asset_id and creator_user_id = auth.uid() and status = 'draft'
  for update;
  if not found then raise exception 'editable draft not found'; end if;

  if coalesce(input_enabled, false) then
    v_quantity := input_quantity;
    if v_quantity is null or v_quantity not between 1 and 100000 then
      raise exception 'limited quantity must be between 1 and 100000';
    end if;
    if coalesce(v_asset.provenance_manifest #>> '{limited_sale,option_price_yen}', '') !~ '^[0-9]+$' then
      raise exception 'limited sale option price is required';
    end if;
    v_option_price := (v_asset.provenance_manifest #>> '{limited_sale,option_price_yen}')::integer;
    if v_option_price < 100 or mod(v_option_price, 100) <> 0 then
      raise exception 'limited sale option price must be at least 100 yen and use 100 yen increments';
    end if;
    if v_asset.sale_price_yen < v_option_price + 100 then
      raise exception 'limited sale total does not include its paid option';
    end if;
  else
    v_quantity := null;
    v_option_price := null;
  end if;

  update public.market_assets
  set limited_quantity = v_quantity, limited_sold_count = 0, updated_at = timezone('utc', now())
  where id = input_asset_id;
  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'listing_limited_sale_updated', 'market_asset', input_asset_id::text,
    jsonb_build_object('enabled', v_quantity is not null, 'quantity', v_quantity,
      'minimum_price_yen', 100, 'option_price_yen', v_option_price));
  return jsonb_build_object('enabled', v_quantity is not null, 'quantity', v_quantity,
    'option_price_yen', v_option_price);
end;
$$;
revoke all on function public.market_set_listing_limited_sale(uuid, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.market_set_listing_limited_sale(uuid, boolean, integer)
  to authenticated;

-- v7 is the public root-listing boundary for the shared 100-yen pricing rule.
create or replace function public.market_create_root_asset_v7(
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
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_limited_option_price integer;
begin
  if coalesce(input_sale_price_yen, 0) < 100 or mod(input_sale_price_yen, 100) <> 0 then
    raise exception 'sale price must be at least 100 yen and use 100 yen increments';
  end if;
  if exists (
    select 1 from jsonb_each_text(coalesce(input_option_prices, '{}'::jsonb)) price
    where price.value !~ '^[0-9]+$'
       or price.value::numeric < 100
       or mod(price.value::numeric, 100) <> 0
       or price.value::numeric > 10000000
  ) then
    raise exception 'paid option prices must be between 100 and 10000000 yen in 100 yen increments';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(input_custom_options, '[]'::jsonb)) option
    where coalesce(option ->> 'price_yen', '') !~ '^[0-9]+$'
       or (option ->> 'price_yen')::numeric < 100
       or mod((option ->> 'price_yen')::numeric, 100) <> 0
       or (option ->> 'price_yen')::numeric > 10000000
  ) then
    raise exception 'custom option prices must be between 100 and 10000000 yen in 100 yen increments';
  end if;
  if coalesce((input_provenance_manifest #>> '{limited_sale,enabled}')::boolean, false) then
    if coalesce(input_provenance_manifest #>> '{limited_sale,option_price_yen}', '') !~ '^[0-9]+$' then
      raise exception 'limited sale option price is required';
    end if;
    v_limited_option_price := (input_provenance_manifest #>> '{limited_sale,option_price_yen}')::integer;
    if v_limited_option_price < 100 or mod(v_limited_option_price, 100) <> 0
       or input_sale_price_yen < v_limited_option_price + 100 then
      raise exception 'invalid limited sale option price';
    end if;
  end if;

  return public.market_create_root_asset_v6(
    input_title, input_description, input_sale_price_yen,
    input_derivative_sales_allowed, input_source_kind, input_source_sha256,
    input_asset_formats, input_selected_option_ids, input_option_prices,
    input_provenance_manifest, input_inherited_terms, input_prohibited_uses,
    input_change_summary, input_terms_version, input_privacy_version,
    input_ai_usage_status, input_terms_confirmed, input_privacy_confirmed,
    input_original_work_confirmed, input_custom_options
  );
end;
$$;

revoke all on function public.market_create_root_asset_v6(text, text, integer, boolean, text, text, text[], text[], jsonb, jsonb, jsonb, jsonb, jsonb, text, text, text, boolean, boolean, boolean, jsonb)
  from public, anon, authenticated;
revoke all on function public.market_create_root_asset_v7(text, text, integer, boolean, text, text, text[], text[], jsonb, jsonb, jsonb, jsonb, jsonb, text, text, text, boolean, boolean, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.market_create_root_asset_v7(text, text, integer, boolean, text, text, text[], text[], jsonb, jsonb, jsonb, jsonb, jsonb, text, text, text, boolean, boolean, boolean, jsonb)
  to authenticated;

commit;
