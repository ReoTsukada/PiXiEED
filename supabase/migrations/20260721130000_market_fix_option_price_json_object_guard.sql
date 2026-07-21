-- PostgreSQL has jsonb_array_length(), but no jsonb_object_length().
-- Listing option prices must be an empty object because all option terms are
-- already included in the single listing price.
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
     or coalesce(input_option_prices, '{}'::jsonb) <> '{}'::jsonb then
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

revoke all on function public.market_create_root_asset_v8(text, text, integer, boolean, text, text, text[], text[], jsonb, jsonb, jsonb, jsonb, jsonb, text, text, text, boolean, boolean, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.market_create_root_asset_v8(text, text, integer, boolean, text, text, text[], text[], jsonb, jsonb, jsonb, jsonb, jsonb, text, text, text, boolean, boolean, boolean, jsonb)
  to authenticated;
