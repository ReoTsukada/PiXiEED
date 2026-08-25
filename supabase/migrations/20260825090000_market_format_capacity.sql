-- Align the effective Market listing RPCs with the format registry.
--
-- The seller UI and package verifier accept every active format in the
-- registry (currently 18 formats). The previous v3/v4 implementations had a
-- stale hard limit of six format IDs. The registry membership check below is
-- the authoritative capacity boundary; sample preview limits remain separate.

create or replace function public.market_create_root_asset_v3(
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
  input_change_summary jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_id uuid;
  v_primary_format text;
  v_format_count integer;
  v_option_count integer;
  v_required_option_price integer;
  v_selected_options jsonb;
begin
  if not public.market_current_user_can_sell() then
    raise exception 'verified seller account required';
  end if;
  if coalesce(input_sale_price_yen, -1) < 0 then
    raise exception 'sale price must be zero or greater';
  end if;
  if coalesce(cardinality(input_asset_formats), 0) = 0 then
    raise exception 'at least one detected asset format is required';
  end if;
  -- Do not impose a second hard-coded format count. The active registry and
  -- the source-kind capability check below define the accepted set.
  if (select count(*) from unnest(input_asset_formats) as formats(format_id))
     <> (select count(distinct format_id) from unnest(input_asset_formats) as formats(format_id)) then
    raise exception 'duplicate asset formats are not allowed';
  end if;

  select count(*) into v_format_count
  from public.market_asset_formats as formats
  where formats.id = any(input_asset_formats)
    and formats.active
    and (
      (input_source_kind = 'external' and formats.allows_external_upload)
      or (input_source_kind = 'pixieed-native' and formats.allows_pixieed_native)
    );
  if v_format_count <> cardinality(input_asset_formats) then
    raise exception 'one or more asset formats are not allowed for this source';
  end if;
  v_primary_format := input_asset_formats[1];

  if coalesce(cardinality(input_selected_option_ids), 0) > 20 then
    raise exception 'too many listing options';
  end if;
  if jsonb_typeof(coalesce(input_option_prices, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid option price map';
  end if;
  if (select count(*) from unnest(coalesce(input_selected_option_ids, array[]::text[])) as options(option_id))
     <> (select count(distinct option_id) from unnest(coalesce(input_selected_option_ids, array[]::text[])) as options(option_id)) then
    raise exception 'duplicate listing options are not allowed';
  end if;
  if exists (
    select 1 from jsonb_object_keys(coalesce(input_option_prices, '{}'::jsonb)) as prices(option_id)
    where not (option_id = any(coalesce(input_selected_option_ids, array[]::text[])))
  ) then
    raise exception 'option price provided for an unselected option';
  end if;
  if exists (
    select 1
    from public.market_license_options as options
    where options.id = any(coalesce(input_selected_option_ids, array[]::text[]))
      and coalesce(input_option_prices, '{}'::jsonb) ? options.id
      and case
        when coalesce(input_option_prices ->> options.id, '') ~ '^[0-9]+$'
          then (input_option_prices ->> options.id)::numeric < options.minimum_price_yen
            or (input_option_prices ->> options.id)::numeric > 10000000
        else true
      end
  ) then
    raise exception 'option price must be an integer between its minimum and 10000000 yen';
  end if;

  select count(*), coalesce(sum(
      case when coalesce(input_option_prices, '{}'::jsonb) ? options.id
        then (input_option_prices ->> options.id)::integer
        else options.minimum_price_yen
      end
    ), 0),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', options.id,
          'label', options.label,
          'minimum_price_yen', options.minimum_price_yen,
          'price_yen', case when coalesce(input_option_prices, '{}'::jsonb) ? options.id
            then (input_option_prices ->> options.id)::integer
            else options.minimum_price_yen
          end
        ) order by options.sort_order, options.id
      ),
      '[]'::jsonb
    )
  into v_option_count, v_required_option_price, v_selected_options
  from public.market_license_options as options
  where options.id = any(coalesce(input_selected_option_ids, array[]::text[]))
    and options.active;

  if v_option_count <> coalesce(cardinality(input_selected_option_ids), 0) then
    raise exception 'one or more listing options are not available';
  end if;

  v_asset_id := public.market_create_root_asset_v2(
    input_title,
    input_description,
    input_sale_price_yen + v_required_option_price,
    input_sale_price_yen,
    v_required_option_price,
    0,
    input_derivative_sales_allowed,
    input_source_kind,
    input_source_sha256,
    v_primary_format,
    coalesce(input_provenance_manifest, '{}'::jsonb)
      || jsonb_build_object('selected_formats', to_jsonb(input_asset_formats)),
    coalesce(input_inherited_terms, '{}'::jsonb)
      || jsonb_build_object('license_options', v_selected_options),
    coalesce(input_prohibited_uses, '[]'::jsonb),
    to_jsonb(coalesce(input_selected_option_ids, array[]::text[])),
    coalesce(input_change_summary, '[]'::jsonb)
  );

  update public.market_assets
  set included_formats = input_asset_formats
  where id = v_asset_id;

  update public.market_asset_series
  set selected_option_ids = coalesce(input_selected_option_ids, array[]::text[]),
      updated_at = timezone('utc', now())
  where root_asset_id = v_asset_id;

  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (
    auth.uid(),
    'listing_configuration_priced',
    'market_asset',
    v_asset_id::text,
    jsonb_build_object(
      'formats', input_asset_formats,
      'option_ids', coalesce(input_selected_option_ids, array[]::text[]),
      'option_prices', coalesce(input_option_prices, '{}'::jsonb),
      'required_option_price_yen', v_required_option_price,
      'seller_price_yen', input_sale_price_yen,
      'purchase_price_yen', input_sale_price_yen + v_required_option_price
    )
  );
  return v_asset_id;
end;
$$;

create or replace function public.market_create_derivative_draft_v4(
  input_source_asset_id uuid,
  input_derivative_license_id uuid,
  input_title text,
  input_description text,
  input_seller_price_yen integer,
  input_source_kind text,
  input_source_sha256 text,
  input_asset_formats text[],
  input_provenance_manifest jsonb,
  input_change_summary jsonb,
  input_terms_version text,
  input_privacy_version text,
  input_ai_usage_status text,
  input_terms_confirmed boolean,
  input_privacy_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_id uuid;
  v_source public.market_assets%rowtype;
  v_series public.market_asset_series%rowtype;
  v_format_count integer;
  v_current_terms_version constant text := '2026-07-19';
  v_current_privacy_version constant text := '2026-07-19';
  v_confirmed_at timestamptz := timezone('utc', now());
begin
  if input_terms_confirmed is not true or input_privacy_confirmed is not true then
    raise exception 'terms and privacy confirmation required';
  end if;
  if input_terms_version is distinct from v_current_terms_version
     or input_privacy_version is distinct from v_current_privacy_version then
    raise exception 'legal document version is outdated';
  end if;
  if input_ai_usage_status is null or input_ai_usage_status not in ('used', 'not-used') then
    raise exception 'AI usage declaration required';
  end if;
  if coalesce(input_seller_price_yen, -1) < 0 then
    raise exception 'seller price must be zero or greater';
  end if;
  if jsonb_typeof(coalesce(input_change_summary, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(input_change_summary, '[]'::jsonb)) = 0 then
    raise exception 'a derivative requires a non-empty change summary';
  end if;
  if coalesce(cardinality(input_asset_formats), 0) = 0 then
    raise exception 'at least one detected asset format is required';
  end if;
  -- Capacity is governed by the active format registry, not a stale count.
  if (select count(*) from unnest(input_asset_formats) as formats(format_id))
     <> (select count(distinct format_id) from unnest(input_asset_formats) as formats(format_id)) then
    raise exception 'duplicate asset formats are not allowed';
  end if;

  select * into v_source
  from public.market_assets
  where id = input_source_asset_id and status = 'published';
  if not found then raise exception 'source asset is not available for derivation'; end if;
  if lower(coalesce(input_source_sha256, '')) = lower(coalesce(v_source.source_sha256, '')) then
    raise exception 'the original package cannot be reposted unchanged';
  end if;
  select * into v_series from public.market_asset_series where id = v_source.series_id;
  if not found or not v_series.derivative_sales_allowed then
    raise exception 'derivative sales are not allowed for this series';
  end if;

  select count(*) into v_format_count
  from public.market_asset_formats formats
  where formats.id = any(input_asset_formats)
    and formats.active
    and (
      (input_source_kind = 'external' and formats.allows_external_upload)
      or (input_source_kind = 'pixieed-native' and formats.allows_pixieed_native)
    );
  if v_format_count <> cardinality(input_asset_formats) then
    raise exception 'one or more asset formats are not allowed for this source';
  end if;

  v_asset_id := public.market_create_derivative_draft_v2(
    input_source_asset_id,
    input_derivative_license_id,
    input_title,
    input_description,
    input_seller_price_yen + v_series.required_option_price_yen,
    input_source_kind,
    input_source_sha256,
    input_asset_formats[1],
    coalesce(input_provenance_manifest, '{}'::jsonb) || jsonb_build_object(
      'selected_formats', to_jsonb(input_asset_formats),
      'derivative_source_asset_id', input_source_asset_id,
      'derivative_listing_right_id', input_derivative_license_id
    ),
    input_change_summary
  );

  update public.market_assets
  set included_formats = input_asset_formats,
      ai_usage_status = input_ai_usage_status,
      terms_version = v_current_terms_version,
      privacy_version = v_current_privacy_version,
      legal_confirmed_at = v_confirmed_at,
      provenance_manifest = coalesce(provenance_manifest, '{}'::jsonb) || jsonb_build_object(
        'ai_usage_status', input_ai_usage_status,
        'legal_confirmation', jsonb_build_object(
          'terms_version', v_current_terms_version,
          'privacy_version', v_current_privacy_version,
          'confirmed_at', v_confirmed_at
        )
      )
  where id = v_asset_id;

  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'derivative_listing_legal_ai_declared', 'market_asset', v_asset_id::text,
    jsonb_build_object('source_asset_id', input_source_asset_id, 'listing_right_id', input_derivative_license_id));
  return v_asset_id;
end;
$$;

-- Preserve the existing internal-only boundary for v3/v4. Public callers keep
-- using v8/v5 and their existing grants.
revoke all on function public.market_create_root_asset_v3(text, text, integer, boolean, text, text, text[], text[], jsonb, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.market_create_derivative_draft_v4(uuid, uuid, text, text, integer, text, text, text[], jsonb, jsonb, text, text, text, boolean, boolean)
  from public, anon, authenticated;
