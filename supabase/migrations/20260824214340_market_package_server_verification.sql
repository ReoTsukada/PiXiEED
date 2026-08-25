-- Server-side package verification and immutable purchase-rights snapshots.
-- This migration intentionally does not claim antivirus scanning. It binds a
-- listing to the Storage bytes, declared formats, hashes, and a stable
-- purchase-time package manifest before a browser can finalize the listing.

alter table public.market_assets
  add column if not exists package_hash text,
  add column if not exists package_verified_at timestamptz,
  add column if not exists package_verified_by uuid references auth.users(id) on delete set null;

alter table public.market_assets
  drop constraint if exists market_assets_package_hash_check;
alter table public.market_assets
  add constraint market_assets_package_hash_check
  check (package_hash is null or package_hash ~ '^[0-9a-f]{64}$');

alter table public.market_purchases
  add column if not exists package_rights_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists package_snapshot_hash text,
  add column if not exists package_snapshot_at timestamptz;

alter table public.market_purchases
  drop constraint if exists market_purchases_package_rights_snapshot_check;
alter table public.market_purchases
  add constraint market_purchases_package_rights_snapshot_check
  check (jsonb_typeof(package_rights_snapshot) = 'object');
alter table public.market_purchases
  drop constraint if exists market_purchases_package_snapshot_hash_check;
alter table public.market_purchases
  add constraint market_purchases_package_snapshot_hash_check
  check (package_snapshot_hash is null or package_snapshot_hash ~ '^[0-9a-f]{64}$');

-- A purchase must retain the exact package and licence terms that existed at
-- purchase-intent time. The trigger runs for all server-side purchase paths,
-- including complimentary access and future payment providers.
create or replace function public.market_capture_package_rights_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset public.market_assets%rowtype;
  v_series public.market_asset_series%rowtype;
  v_manifest jsonb;
begin
  select * into v_asset
  from public.market_assets
  where id = new.asset_id;
  if not found then
    raise exception 'market asset required for package snapshot';
  end if;

  select * into v_series
  from public.market_asset_series
  where id = v_asset.series_id;
  if not found then
    raise exception 'market asset series required for package snapshot';
  end if;

  v_manifest := case
    when jsonb_typeof(coalesce(v_asset.provenance_manifest, '{}'::jsonb)) = 'object'
      then v_asset.provenance_manifest
    else '{}'::jsonb
  end;

  new.package_rights_snapshot := jsonb_build_object(
    'schema', 'pixieed-market-purchase-rights/v1',
    'captured_at', timezone('utc', now()),
    'asset_id', v_asset.id,
    'title', v_asset.title,
    'asset_format', v_asset.asset_format,
    'included_formats', to_jsonb(coalesce(v_asset.included_formats, array[]::text[])),
    'product_composition', v_manifest -> 'product_composition',
    'source_sha256', v_asset.source_sha256,
    'package_hash', v_asset.package_hash,
    'files', coalesce(v_manifest -> 'files', '[]'::jsonb),
    'storage_manifest_path', v_manifest -> 'storage_manifest_path',
    'storage_file_paths', coalesce(v_manifest -> 'storage_file_paths', '[]'::jsonb),
    'storage_sample_preview_paths', coalesce(v_manifest -> 'storage_sample_preview_paths', '[]'::jsonb),
    'license', jsonb_build_object(
      'derivative_sales_allowed', v_series.derivative_sales_allowed,
      'inherited_terms', v_series.inherited_terms,
      'prohibited_uses', v_series.prohibited_uses,
      'selected_option_ids', to_jsonb(coalesce(v_series.selected_option_ids, array[]::text[]))
    )
  );
  new.package_snapshot_hash := v_asset.package_hash;
  new.package_snapshot_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists market_purchases_capture_package_rights_snapshot on public.market_purchases;
create trigger market_purchases_capture_package_rights_snapshot
before insert on public.market_purchases
for each row execute function public.market_capture_package_rights_snapshot();

-- The existing attachment implementation remains the byte/path validator.
-- This outer guard adds the missing server-verification boundary before it is
-- allowed to publish or submit a listing.
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
  v_asset public.market_assets%rowtype;
  v_needs_review boolean;
  v_required_prefix text := auth.uid()::text || '/' || input_asset_id::text || '/verified/';
  v_file_count integer := coalesce(cardinality(input_file_object_paths), 0);
  v_sample_count integer := coalesce(cardinality(input_sample_preview_paths), 0);
  v_found_count integer;
  v_total_bytes bigint;
begin
  select * into v_asset
  from public.market_assets
  where id = input_asset_id and creator_user_id = auth.uid()
  for update;
  if not found then raise exception 'editable draft not found'; end if;

  if v_asset.status in ('review', 'published')
     and v_asset.asset_object_path = input_manifest_object_path then
    return;
  end if;
  if v_asset.status <> 'draft' then raise exception 'editable draft not found'; end if;
  if v_asset.file_scan_status <> 'clean'
     or v_asset.package_hash is null
     or coalesce(v_asset.provenance_manifest #>> '{server_verification,status}', '') <> 'clean' then
    raise exception 'server verified package required';
  end if;
  if v_file_count < 1 or v_file_count > 128 then raise exception 'invalid verified package file count'; end if;
  if nullif(btrim(input_manifest_object_path), '') is null
     or left(input_manifest_object_path, char_length(v_required_prefix)) <> v_required_prefix then
    raise exception 'invalid verified manifest path';
  end if;
  if exists (
    select 1 from unnest(input_file_object_paths) as files(file_path)
    where left(file_path, char_length(v_required_prefix)) <> v_required_prefix
  ) then raise exception 'invalid verified package file path'; end if;
  if (select count(*) from unnest(input_file_object_paths) as files(file_path))
     <> (select count(distinct file_path) from unnest(input_file_object_paths) as files(file_path)) then
    raise exception 'duplicate verified package file paths are not allowed';
  end if;
  if coalesce(v_asset.provenance_manifest ->> 'storage_manifest_path', '') <> input_manifest_object_path
     or coalesce(v_asset.provenance_manifest -> 'storage_file_paths', '[]'::jsonb) <> to_jsonb(input_file_object_paths) then
    raise exception 'verified package paths do not match the verification result';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'market-private' and name = input_manifest_object_path
  ) then raise exception 'verified package manifest not found'; end if;
  select count(*) into v_found_count
  from storage.objects
  where bucket_id = 'market-private' and name = any(input_file_object_paths);
  if v_found_count <> v_file_count then raise exception 'verified package file missing'; end if;
  select coalesce(sum(coalesce((metadata ->> 'size')::bigint, 0)), 0)
    into v_total_bytes
  from storage.objects
  where bucket_id = 'market-private' and name = any(input_file_object_paths);
  if v_total_bytes > 52428800 then raise exception 'verified package exceeds 50 MB'; end if;
  if input_preview_object_path is not null and not exists (
    select 1 from storage.objects where bucket_id = 'market-private' and name = input_preview_object_path
  ) then raise exception 'verified thumbnail not found'; end if;
  if v_sample_count > 6 or (v_sample_count > 0 and (
    select count(*) from storage.objects
    where bucket_id = 'market-private' and name = any(input_sample_preview_paths)
  ) <> v_sample_count) then raise exception 'verified sample preview missing'; end if;

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
  where id = input_asset_id and creator_user_id = auth.uid() and status = 'draft';
  if not found then raise exception 'editable draft not found'; end if;

  select * into v_asset from public.market_assets where id = input_asset_id for update;
  v_needs_review := v_asset.ai_usage_status = 'used' or v_asset.parent_asset_id is not null;

  if v_needs_review then
    update public.market_assets
    set status = 'review',
        submitted_at = coalesce(submitted_at, timezone('utc', now())),
        updated_at = timezone('utc', now())
    where id = input_asset_id;
  else
    update public.market_assets
    set status = 'published',
        verification_status = 'self-declared',
        verification_level = 'external-self-declared',
        published_at = coalesce(published_at, timezone('utc', now())),
        updated_at = timezone('utc', now())
    where id = input_asset_id;
    update public.market_asset_series
    set status = 'published', updated_at = timezone('utc', now())
    where root_asset_id = input_asset_id;
  end if;

  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (
    auth.uid(),
    case when v_needs_review then 'listing_submitted_for_review' else 'listing_auto_published' end,
    'market_asset', input_asset_id::text,
    jsonb_build_object(
      'reason', case when v_needs_review then 'ai_or_derivative' else 'self_declared_original' end,
      'package_hash', v_asset.package_hash,
      'server_verification', true
    )
  );
end;
$$;

revoke all on function public.market_attach_listing_package(uuid, text, text[], text, text[])
  from public, anon, authenticated;
grant execute on function public.market_attach_listing_package(uuid, text, text[], text, text[])
  to authenticated;

-- Staging files remain seller-owned and replaceable. Verified files are
-- written only by the service-role Edge Function and cannot be overwritten or
-- deleted by the browser seller after verification.
drop policy if exists market_private_upload_own on storage.objects;
create policy market_private_upload_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'market-private'
  and owner_id = auth.uid()::text
  and public.market_listing_is_enabled()
  and public.market_current_user_can_sell()
  and name like (auth.uid()::text || '/%')
  and name not like '%/verified/%'
);

drop policy if exists market_private_delete_own on storage.objects;
create policy market_private_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'market-private'
  and owner_id = auth.uid()::text
  and name not like '%/verified/%'
);
