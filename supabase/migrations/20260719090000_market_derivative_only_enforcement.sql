-- Purchased PiXiEED assets must use their lineage right when they are resold.
-- Exact package/file reuse is rejected from the root-listing path, while the
-- derivative path requires and consumes the matching one-time listing right.

create or replace function public.market_root_source_conflicts_with_existing_asset(
  input_source_sha256 text,
  input_provenance_manifest jsonb
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with submitted_hashes as (
    select lower(file_entry ->> 'sha256') as sha256
    from jsonb_array_elements(
      case
        when jsonb_typeof(coalesce(input_provenance_manifest -> 'files', '[]'::jsonb)) = 'array'
          then coalesce(input_provenance_manifest -> 'files', '[]'::jsonb)
        else '[]'::jsonb
      end
    ) as file_entry
    where coalesce(file_entry ->> 'sha256', '') ~ '^[0-9a-fA-F]{64}$'
  ), existing_hashes as (
    select asset.id, asset.creator_user_id, lower(asset.source_sha256) as sha256
    from public.market_assets asset
    where asset.source_sha256 is not null
    union all
    select asset.id, asset.creator_user_id, lower(file_entry ->> 'sha256') as sha256
    from public.market_assets asset
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(coalesce(asset.provenance_manifest -> 'files', '[]'::jsonb)) = 'array'
          then coalesce(asset.provenance_manifest -> 'files', '[]'::jsonb)
        else '[]'::jsonb
      end
    ) as file_entry
    where coalesce(file_entry ->> 'sha256', '') ~ '^[0-9a-fA-F]{64}$'
  )
  select exists (
    select 1
    from existing_hashes existing
    where existing.creator_user_id <> auth.uid()
      and (
        existing.sha256 = lower(coalesce(input_source_sha256, ''))
        or existing.sha256 in (select sha256 from submitted_hashes)
      )
  );
$$;

revoke all on function public.market_root_source_conflicts_with_existing_asset(text, jsonb)
  from public, anon, authenticated;

create or replace function public.market_create_root_asset_v5(
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
  input_original_work_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_id uuid;
  v_confirmed_at timestamptz := timezone('utc', now());
begin
  if input_terms_version is distinct from '2026-07-19'
     or input_privacy_version is distinct from '2026-07-19' then
    raise exception 'legal document version is outdated';
  end if;
  if input_original_work_confirmed is not true then
    raise exception 'original-work confirmation required';
  end if;
  if public.market_root_source_conflicts_with_existing_asset(
    input_source_sha256,
    coalesce(input_provenance_manifest, '{}'::jsonb)
  ) then
    raise exception 'an existing PiXiEED asset must be listed through its derivative right';
  end if;

  v_asset_id := public.market_create_root_asset_v4(
    input_title, input_description, input_sale_price_yen,
    input_derivative_sales_allowed, input_source_kind, input_source_sha256,
    input_asset_formats, input_selected_option_ids, input_option_prices,
    input_provenance_manifest, input_inherited_terms, input_prohibited_uses,
    input_change_summary, '2026-07-18', '2026-07-18',
    input_ai_usage_status, input_terms_confirmed, input_privacy_confirmed
  );
  update public.market_assets
  set terms_version = input_terms_version,
      privacy_version = input_privacy_version,
      legal_confirmed_at = v_confirmed_at,
      provenance_manifest = coalesce(provenance_manifest, '{}'::jsonb) || jsonb_build_object(
        'legal_confirmation', jsonb_build_object(
          'terms_version', input_terms_version,
          'privacy_version', input_privacy_version,
          'confirmed_at', v_confirmed_at
        )
      )
  where id = v_asset_id;
  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'listing_legal_version_confirmed_v5', 'market_asset', v_asset_id::text,
    jsonb_build_object('terms_version', input_terms_version, 'privacy_version', input_privacy_version,
      'confirmed_at', v_confirmed_at));
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
  if coalesce(cardinality(input_asset_formats), 0) = 0 or cardinality(input_asset_formats) > 6 then
    raise exception 'one to six detected asset formats are required';
  end if;
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

create or replace function public.market_derivative_listing_context_v1(
  input_source_asset_id uuid,
  input_derivative_license_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_license public.market_derivative_licenses%rowtype;
  v_source public.market_assets%rowtype;
  v_series public.market_asset_series%rowtype;
  v_minimum_total integer;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  select * into v_license
  from public.market_derivative_licenses
  where id = input_derivative_license_id
    and purchaser_user_id = auth.uid()
    and source_asset_id = input_source_asset_id;
  if not found or v_license.status <> 'active' or v_license.used_by_asset_id is not null then
    raise exception 'an unused derivative listing right is required';
  end if;
  select * into v_source from public.market_assets where id = input_source_asset_id and status = 'published';
  if not found then raise exception 'source asset is not available for derivation'; end if;
  select * into v_series from public.market_asset_series where id = v_source.series_id and status = 'published';
  if not found or not v_series.derivative_sales_allowed then
    raise exception 'derivative sales are not allowed for this series';
  end if;
  v_minimum_total := ceiling((v_series.base_use_price_yen + v_series.required_option_price_yen) * 1.2)::integer;
  return jsonb_build_object(
    'source_asset_id', v_source.id,
    'source_title', v_source.title,
    'listing_right_id', v_license.id,
    'required_option_price_yen', v_series.required_option_price_yen,
    'minimum_total_price_yen', v_minimum_total,
    'minimum_seller_price_yen', greatest(0, v_minimum_total - v_series.required_option_price_yen),
    'inherited_terms', v_series.inherited_terms,
    'derivative_sales_allowed', true
  );
end;
$$;

revoke all on function public.market_create_root_asset_v4(text, text, integer, boolean, text, text, text[], text[], jsonb, jsonb, jsonb, jsonb, jsonb, text, text, text, boolean, boolean)
  from public, anon, authenticated;
revoke all on function public.market_create_derivative_draft_v2(uuid, uuid, text, text, integer, text, text, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.market_create_root_asset_v5(text, text, integer, boolean, text, text, text[], text[], jsonb, jsonb, jsonb, jsonb, jsonb, text, text, text, boolean, boolean, boolean)
  from public, anon, authenticated;
revoke all on function public.market_create_derivative_draft_v4(uuid, uuid, text, text, integer, text, text, text[], jsonb, jsonb, text, text, text, boolean, boolean)
  from public, anon, authenticated;
revoke all on function public.market_derivative_listing_context_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.market_create_root_asset_v5(text, text, integer, boolean, text, text, text[], text[], jsonb, jsonb, jsonb, jsonb, jsonb, text, text, text, boolean, boolean, boolean)
  to authenticated;
grant execute on function public.market_create_derivative_draft_v4(uuid, uuid, text, text, integer, text, text, text[], jsonb, jsonb, text, text, text, boolean, boolean)
  to authenticated;
grant execute on function public.market_derivative_listing_context_v1(uuid, uuid)
  to authenticated;
