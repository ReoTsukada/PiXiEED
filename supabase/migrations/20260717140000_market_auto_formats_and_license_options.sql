-- Automatic package format detection and server-validated listing options.
-- The browser normally uses platform minimums and may submit seller overrides,
-- but this RPC validates every selected price against the active server catalog.

create table if not exists public.market_license_options (
  id text primary key,
  label text not null,
  description text not null default '',
  minimum_price_yen integer not null check (minimum_price_yen >= 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.market_license_options (
  id, label, description, minimum_price_yen, sort_order
) values
  ('commercial-use', '商用利用', '事業・収益化サービスで利用できます。', 500, 10),
  ('game-app-use', 'ゲーム・アプリ利用', 'ゲームやアプリへ素材として組み込めます。', 500, 20),
  ('video-stream-use', '動画・配信利用', '動画、配信、配信画面で利用できます。', 300, 30),
  ('merchandise-use', 'グッズ・印刷物利用', 'グッズや印刷物へ利用できます。', 1000, 40),
  ('credit-omission', 'クレジット表記不要', '利用時の作者名表記を省略できます。', 300, 50)
on conflict (id) do update set
  label = excluded.label,
  description = excluded.description,
  minimum_price_yen = excluded.minimum_price_yen,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc', now());

alter table public.market_license_options enable row level security;
drop policy if exists market_license_options_read_active on public.market_license_options;
create policy market_license_options_read_active
on public.market_license_options for select
to anon, authenticated
using (active);

alter table public.market_assets
  add column if not exists included_formats text[] not null default array[]::text[];

alter table public.market_asset_series
  add column if not exists selected_option_ids text[] not null default array[]::text[];

-- A separate derivative-production fee is intentionally not charged. The
-- original product price and lineage royalty already compensate the lineage.
update public.market_asset_series
set derivative_license_price_yen = 0
where derivative_license_price_yen <> 0;
alter table public.market_asset_series
  drop constraint if exists market_asset_series_no_derivative_license_fee;
alter table public.market_asset_series
  add constraint market_asset_series_no_derivative_license_fee
  check (derivative_license_price_yen = 0);

-- An uploaded .pixieedraw file is recorded as an external upload unless it
-- arrives through the future in-app signed manifest flow. This avoids falsely
-- presenting a filename extension as PiXiEED-native verification.
update public.market_asset_formats
set allows_external_upload = true
where id = 'pixiedraw-project';

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
  if cardinality(input_asset_formats) > 6 then
    raise exception 'too many asset formats';
  end if;
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

revoke all on function public.market_create_root_asset_v3(text, text, integer, boolean, text, text, text[], text[], jsonb, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.market_create_root_asset_v3(text, text, integer, boolean, text, text, text[], text[], jsonb, jsonb, jsonb, jsonb, jsonb)
  to authenticated;

-- Browser clients use v3 so they cannot submit a legacy derivative fee or
-- bypass the server-side option price validation through v2.
revoke all on function public.market_create_root_asset_v2(text, text, integer, integer, integer, integer, boolean, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;

create or replace function public.market_attach_listing_package(
  input_asset_id uuid,
  input_manifest_object_path text,
  input_file_object_paths text[],
  input_preview_object_path text default null,
  input_sample_preview_paths text[] default array[]::text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_required_prefix text := auth.uid()::text || '/' || input_asset_id::text || '/';
  v_file_count integer := coalesce(cardinality(input_file_object_paths), 0);
  v_found_count integer;
  v_total_bytes bigint;
  v_sample_count integer := coalesce(cardinality(input_sample_preview_paths), 0);
begin
  if not public.market_current_user_can_sell() then
    raise exception 'verified seller account required';
  end if;
  if v_file_count < 1 or v_file_count > 100 then
    raise exception 'package must contain between 1 and 100 files';
  end if;
  if nullif(btrim(input_manifest_object_path), '') is null
     or left(input_manifest_object_path, char_length(v_required_prefix)) <> v_required_prefix then
    raise exception 'invalid private manifest path';
  end if;
  if input_preview_object_path is not null
     and left(input_preview_object_path, char_length(v_required_prefix)) <> v_required_prefix then
    raise exception 'invalid private preview path';
  end if;
  if v_sample_count > 6 then
    raise exception 'too many sample previews';
  end if;
  if exists (
    select 1 from unnest(coalesce(input_sample_preview_paths, array[]::text[])) as previews(preview_path)
    where left(preview_path, char_length(v_required_prefix)) <> v_required_prefix
  ) then
    raise exception 'invalid private sample preview path';
  end if;
  if exists (
    select 1 from unnest(input_file_object_paths) as files(file_path)
    where left(file_path, char_length(v_required_prefix)) <> v_required_prefix
  ) then
    raise exception 'invalid private package file path';
  end if;
  if (select count(*) from unnest(input_file_object_paths) as files(file_path))
     <> (select count(distinct file_path) from unnest(input_file_object_paths) as files(file_path)) then
    raise exception 'duplicate package file paths are not allowed';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'market-private'
      and name = input_manifest_object_path
      and owner_id = auth.uid()::text
  ) then
    raise exception 'uploaded package manifest not found';
  end if;
  if input_preview_object_path is not null and not exists (
    select 1 from storage.objects
    where bucket_id = 'market-private'
      and name = input_preview_object_path
      and owner_id = auth.uid()::text
  ) then
    raise exception 'uploaded thumbnail not found';
  end if;
  if v_sample_count > 0 and (
    select count(*) from storage.objects
    where bucket_id = 'market-private'
      and owner_id = auth.uid()::text
      and name = any(input_sample_preview_paths)
  ) <> v_sample_count then
    raise exception 'one or more sample previews were not found';
  end if;

  select count(*) into v_found_count
  from storage.objects
  where bucket_id = 'market-private'
    and owner_id = auth.uid()::text
    and name = any(input_file_object_paths);
  if v_found_count <> v_file_count then
    raise exception 'one or more uploaded package files were not found';
  end if;
  select coalesce(sum(coalesce((metadata ->> 'size')::bigint, 0)), 0)
  into v_total_bytes
  from storage.objects
  where bucket_id = 'market-private'
    and owner_id = auth.uid()::text
    and name = any(input_file_object_paths);
  if v_total_bytes > 52428800 then
    raise exception 'package total size exceeds 50 MB';
  end if;

  update public.market_assets
  set asset_object_path = input_manifest_object_path,
      preview_object_path = input_preview_object_path,
      provenance_manifest = provenance_manifest || jsonb_build_object(
        'storage_manifest_path', input_manifest_object_path,
        'storage_file_paths', to_jsonb(input_file_object_paths),
        'storage_sample_preview_paths', to_jsonb(coalesce(input_sample_preview_paths, array[]::text[])),
        'file_count', v_file_count
      ),
      updated_at = timezone('utc', now())
  where id = input_asset_id
    and creator_user_id = auth.uid()
    and status = 'draft';
  if not found then
    raise exception 'editable draft not found';
  end if;

  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (
    auth.uid(),
    'listing_package_attached',
    'market_asset',
    input_asset_id::text,
    jsonb_build_object('file_count', v_file_count, 'total_bytes', v_total_bytes, 'sample_preview_count', v_sample_count)
  );
end;
$$;

revoke all on function public.market_attach_listing_package(uuid, text, text[], text, text[])
  from public, anon, authenticated;
grant execute on function public.market_attach_listing_package(uuid, text, text[], text, text[])
  to authenticated;
