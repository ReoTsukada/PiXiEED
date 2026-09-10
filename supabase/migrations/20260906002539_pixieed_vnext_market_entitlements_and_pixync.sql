-- PiXiEED vNext: canonical Market access and PiXYNC server contracts.
--
-- This migration is intentionally additive. Existing market purchases,
-- Stripe records, royalty rows, package paths, and shared-project data are
-- retained. New access decisions are recorded in the entitlement table and
-- resolved against an immutable package revision.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Market format registry
-- ---------------------------------------------------------------------------

alter table public.market_asset_formats
  drop constraint if exists market_asset_formats_media_kind_check;

alter table public.market_asset_formats
  add constraint market_asset_formats_media_kind_check
  check (media_kind in ('project', 'image', 'animation', 'text', 'video', 'audio'));

insert into public.market_asset_formats (
  id, label, media_kind, allows_pixieed_native, allows_external_upload, active
) values
  ('novel-json', '小説・世界観（JSON）', 'text', true, true, true),
  ('visual-project', '画像・動画Project（JSON）', 'text', true, true, true),
  ('text', 'テキスト', 'text', true, true, true),
  ('markdown', 'Markdown', 'text', true, true, true),
  ('html', 'HTML', 'text', true, true, true),
  ('csv', 'CSV', 'text', true, true, true),
  ('rtf', 'RTF', 'text', true, true, true),
  ('json', 'JSON', 'text', true, true, true),
  ('mp4', 'MP4動画', 'video', true, true, true),
  ('webm', 'WebM動画', 'video', true, true, true),
  ('mov', 'QuickTime動画', 'video', true, true, true),
  ('m4v', 'M4V動画', 'video', true, true, true),
  ('ogv', 'Ogg動画', 'video', true, true, true)
on conflict (id) do update set
  label = excluded.label,
  media_kind = excluded.media_kind,
  allows_pixieed_native = excluded.allows_pixieed_native,
  allows_external_upload = excluded.allows_external_upload,
  active = excluded.active;

-- ---------------------------------------------------------------------------
-- Immutable package revisions and canonical user access
-- ---------------------------------------------------------------------------

create table if not exists public.market_asset_revisions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.market_assets(id) on delete restrict,
  revision_number integer not null default 1 check (revision_number > 0),
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  source_sha256 text check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$'),
  package_hash text check (package_hash is null or package_hash ~ '^[0-9a-f]{64}$'),
  manifest jsonb not null default '{}'::jsonb check (jsonb_typeof(manifest) = 'object'),
  storage_file_paths text[] not null default array[]::text[],
  status text not null default 'active' check (status in ('active', 'superseded', 'revoked')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (asset_id, revision_number),
  unique (asset_id, content_hash)
);

create index if not exists market_asset_revisions_active_idx
  on public.market_asset_revisions(asset_id, status, revision_number desc);

alter table public.market_assets
  add column if not exists active_revision_id uuid;

alter table public.market_assets
  drop constraint if exists market_assets_active_revision_fk;
alter table public.market_assets
  add constraint market_assets_active_revision_fk
  foreign key (active_revision_id) references public.market_asset_revisions(id) on delete restrict;

create table if not exists public.market_asset_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  asset_id uuid not null references public.market_assets(id) on delete restrict,
  purchase_id uuid references public.market_purchases(id) on delete restrict,
  revision_id uuid references public.market_asset_revisions(id) on delete restrict,
  acquisition_kind text not null check (acquisition_kind in ('paid', 'free', 'admin')),
  status text not null default 'active' check (status in ('active', 'revoked', 'refunded')),
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  license_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(license_snapshot) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  granted_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (purchase_id),
  check (status <> 'revoked' or revoked_at is not null)
);

create unique index if not exists market_asset_entitlements_one_active_access
  on public.market_asset_entitlements(user_id, asset_id)
  where status = 'active';

create index if not exists market_asset_entitlements_user_idx
  on public.market_asset_entitlements(user_id, status, granted_at desc);

create index if not exists market_asset_entitlements_asset_idx
  on public.market_asset_entitlements(asset_id, status, granted_at desc);

alter table public.market_asset_revisions enable row level security;
alter table public.market_asset_entitlements enable row level security;

-- Revision manifests contain private Storage object paths. Public catalog
-- metadata is exposed only through the allowlisted catalog RPCs below; the
-- revision table itself remains server-side.
drop policy if exists market_asset_revisions_read_published on public.market_asset_revisions;

drop policy if exists market_asset_entitlements_read_own on public.market_asset_entitlements;
create policy market_asset_entitlements_read_own
on public.market_asset_entitlements for select
to authenticated
using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.market_asset_revisions from anon, authenticated;
revoke all on public.market_asset_revisions from public, anon, authenticated;
revoke insert, update, delete on public.market_asset_entitlements from anon, authenticated;
grant select on public.market_asset_entitlements to authenticated;
grant select on public.market_asset_revisions to service_role;
grant select on public.market_asset_entitlements to service_role;

-- A binding is a server-visible use record, not the Project payload itself.
-- It keeps the current Project identity and the exact purchased revision
-- separate from the local PXD/iGAME state, so a Market import can never
-- replace or authorize a different Project by changing client metadata.
create table if not exists public.market_asset_bindings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  project_id text not null check (project_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$'),
  asset_id uuid not null references public.market_assets(id) on delete restrict,
  entitlement_id uuid not null references public.market_asset_entitlements(id) on delete restrict,
  revision_id uuid not null references public.market_asset_revisions(id) on delete restrict,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  license_id text not null check (license_id ~ '^market-license:[0-9a-f-]{36}$'),
  delivery_id text not null check (length(btrim(delivery_id)) between 1 and 256),
  mode text not null default 'PINNED' check (mode = 'PINNED'),
  status text not null default 'active' check (status in ('active', 'removed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  removed_at timestamptz,
  unique (user_id, project_id, asset_id, revision_id),
  check (status <> 'removed' or removed_at is not null)
);

create index if not exists market_asset_bindings_user_project_idx
  on public.market_asset_bindings(user_id, project_id, status, updated_at desc);

alter table public.market_asset_bindings enable row level security;
drop policy if exists market_asset_bindings_read_own on public.market_asset_bindings;
create policy market_asset_bindings_read_own
on public.market_asset_bindings for select
to authenticated
using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.market_asset_bindings from anon, authenticated;
grant select on public.market_asset_bindings to authenticated;
grant select on public.market_asset_bindings to service_role;

create or replace function public.market_record_asset_binding_v1(
  input_asset_id uuid,
  input_project_id text,
  input_revision_id uuid,
  input_content_hash text,
  input_license_id text,
  input_delivery_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_project_id text := btrim(coalesce(input_project_id, ''));
  v_content_hash text := lower(btrim(coalesce(input_content_hash, '')));
  v_license_id text := btrim(coalesce(input_license_id, ''));
  v_delivery_id text := btrim(coalesce(input_delivery_id, ''));
  v_entitlement public.market_asset_entitlements%rowtype;
  v_revision public.market_asset_revisions%rowtype;
  v_binding public.market_asset_bindings%rowtype;
  v_snapshot jsonb;
begin
  if v_user_id is null or not public.market_current_user_has_confirmed_identity() then
    raise exception 'confirmed account login required';
  end if;
  if input_asset_id is null or v_project_id !~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$' then
    raise exception 'asset binding identity is invalid';
  end if;
  if input_revision_id is null or v_content_hash !~ '^[0-9a-f]{64}$' or v_license_id !~ '^market-license:[0-9a-f-]{36}$' or length(v_delivery_id) = 0 then
    raise exception 'asset binding proof is invalid';
  end if;

  select * into v_entitlement
  from public.market_asset_entitlements
  where user_id = v_user_id
    and asset_id = input_asset_id
    and status = 'active'
  for share;
  if not found then raise exception 'active market entitlement required'; end if;

  select * into v_revision
  from public.market_asset_revisions
  where id = v_entitlement.revision_id
    and asset_id = input_asset_id
    and status = 'active'
  for share;
  if not found or v_revision.id <> input_revision_id or v_revision.content_hash <> v_content_hash or v_entitlement.content_hash <> v_content_hash then
    raise exception 'asset binding revision does not match the entitlement';
  end if;

  v_snapshot := coalesce(v_entitlement.license_snapshot, '{}'::jsonb);
  if v_snapshot ->> 'license_id' is distinct from v_license_id
     or (v_snapshot ->> 'status') is distinct from 'ACTIVE'
     or (v_snapshot ->> 'in_game_use') is distinct from 'true' then
    raise exception 'active iGAME license is required';
  end if;

  insert into public.market_asset_bindings (
    user_id, project_id, asset_id, entitlement_id, revision_id,
    content_hash, license_id, delivery_id, mode, status, removed_at, updated_at
  ) values (
    v_user_id, v_project_id, input_asset_id, v_entitlement.id, v_revision.id,
    v_content_hash, v_license_id, v_delivery_id, 'PINNED', 'active', null, timezone('utc', now())
  )
  on conflict (user_id, project_id, asset_id, revision_id) do update set
    entitlement_id = excluded.entitlement_id,
    content_hash = excluded.content_hash,
    license_id = excluded.license_id,
    delivery_id = excluded.delivery_id,
    mode = 'PINNED',
    status = 'active',
    removed_at = null,
    updated_at = timezone('utc', now())
  returning * into v_binding;

  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (
    v_user_id, 'market_asset_bound_to_project', 'market_asset_binding', v_binding.id::text,
    jsonb_build_object(
      'project_id', v_project_id,
      'asset_id', input_asset_id,
      'entitlement_id', v_entitlement.id,
      'revision_id', v_revision.id,
      'content_hash', v_content_hash,
      'delivery_id', v_delivery_id
    )
  );
  return jsonb_build_object(
    'ok', true,
    'binding_id', v_binding.id,
    'project_id', v_binding.project_id,
    'asset_id', v_binding.asset_id,
    'entitlement_id', v_binding.entitlement_id,
    'revision_id', v_binding.revision_id,
    'content_hash', v_binding.content_hash,
    'license_id', v_binding.license_id,
    'mode', v_binding.mode,
    'status', v_binding.status
  );
end;
$$;

revoke all on function public.market_record_asset_binding_v1(uuid, text, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.market_record_asset_binding_v1(uuid, text, uuid, text, text, text)
  to authenticated;

-- The current admin-grant contract is extended with a server-only free
-- acquisition provider. Amounts remain zero and no royalty/inventory sale is
-- created for either kind of grant.
alter table public.market_purchases
  drop constraint if exists market_purchases_admin_grant_valid;
alter table public.market_purchases
  add constraint market_purchases_admin_grant_valid
  check (
    (status = 'granted') = (coalesce(payment_provider, '') in ('admin_grant', 'free_acquisition'))
    and (
      status <> 'granted'
      or (
        purchase_kind = 'standard_use'
        and payment_provider in ('admin_grant', 'free_acquisition')
        and provider_payment_id is not null
        and provider_checkout_session_id is null
        and provider_charge_id is null
        and provider_refund_id is null
        and gross_amount_yen = 0
        and processor_fee_yen = 0
        and platform_fee_yen = 0
        and distributable_amount_yen = 0
        and paid_at is null
        and refunded_at is null
      )
    )
  );

create or replace function public.market_enforce_minimum_purchase_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'granted' then
    if new.payment_provider not in ('admin_grant', 'free_acquisition')
       or new.gross_amount_yen <> 0
       or new.processor_fee_yen <> 0
       or new.platform_fee_yen <> 0
       or new.distributable_amount_yen <> 0 then
      raise exception 'invalid zero-yen market grant';
    end if;
    return new;
  end if;
  if new.purchase_kind = 'standard_use' and new.gross_amount_yen < 500 then
    raise exception 'market purchase amount must be at least 500 yen';
  end if;
  return new;
end;
$$;

-- Create a revision whenever the server verifier has attached a package.
-- Legacy rows without a package hash remain readable through the old purchase
-- path, but cannot be promoted to a revision-bound iGAME binding.
create or replace function public.market_sync_asset_revision_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision_id uuid;
  v_content_hash text;
begin
  if new.package_hash is null or new.package_hash !~ '^[0-9a-f]{64}$' then
    return new;
  end if;
  v_content_hash := lower(new.package_hash);
  insert into public.market_asset_revisions (
    asset_id, revision_number, content_hash, source_sha256, package_hash,
    manifest, storage_file_paths, status
  ) values (
    new.id,
    coalesce((select max(revision_number) + 1 from public.market_asset_revisions where asset_id = new.id and content_hash is distinct from v_content_hash), 1),
    v_content_hash,
    lower(new.source_sha256),
    v_content_hash,
    coalesce(new.provenance_manifest, '{}'::jsonb),
    coalesce(
      (
        select array_agg(entry.value order by entry.ordinality)
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(new.provenance_manifest -> 'storage_file_paths') = 'array'
              then new.provenance_manifest -> 'storage_file_paths'
            else '[]'::jsonb
          end
        ) with ordinality as entry(value, ordinality)
      ),
      array[]::text[]
    ),
    'active'
  )
  on conflict (asset_id, content_hash) do update set
    source_sha256 = excluded.source_sha256,
    package_hash = excluded.package_hash,
    manifest = excluded.manifest,
    storage_file_paths = excluded.storage_file_paths,
    status = 'active';

  select id into v_revision_id
  from public.market_asset_revisions
  where asset_id = new.id and content_hash = v_content_hash;

  update public.market_asset_revisions
  set status = case when id = v_revision_id then 'active' else 'superseded' end
  where asset_id = new.id and status <> 'revoked';

  update public.market_assets
  set active_revision_id = v_revision_id
  where id = new.id and active_revision_id is distinct from v_revision_id;
  return new;
end;
$$;

drop trigger if exists market_assets_sync_revision on public.market_assets;
create trigger market_assets_sync_revision
after insert or update of package_hash, source_sha256, provenance_manifest
on public.market_assets
for each row execute function public.market_sync_asset_revision_v1();

insert into public.market_asset_revisions (
  asset_id, revision_number, content_hash, source_sha256, package_hash,
  manifest, storage_file_paths, status
)
select
  assets.id,
  1,
  lower(assets.package_hash),
  lower(assets.source_sha256),
  lower(assets.package_hash),
  coalesce(assets.provenance_manifest, '{}'::jsonb),
  array[]::text[],
  'active'
from public.market_assets as assets
where assets.package_hash ~ '^[0-9a-f]{64}$'
on conflict (asset_id, content_hash) do nothing;

update public.market_assets as assets
set active_revision_id = revisions.id
from public.market_asset_revisions as revisions
where revisions.asset_id = assets.id
  and revisions.content_hash = lower(assets.package_hash)
  and assets.active_revision_id is distinct from revisions.id;

-- ---------------------------------------------------------------------------
-- Entitlement materialization and free acquisition
-- ---------------------------------------------------------------------------

create or replace function public.market_materialize_entitlement_v1(
  input_purchase_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.market_purchases%rowtype;
  v_asset public.market_assets%rowtype;
  v_series public.market_asset_series%rowtype;
  v_revision public.market_asset_revisions%rowtype;
  v_entitlement_id uuid;
  v_acquisition_kind text;
  v_content_hash text;
  v_license jsonb;
  v_snapshot jsonb;
begin
  select * into v_purchase
  from public.market_purchases
  where id = input_purchase_id
  for update;
  if not found or v_purchase.status not in ('paid', 'granted') then
    raise exception 'completed market access is required';
  end if;
  if v_purchase.purchase_kind <> 'standard_use' then
    return null;
  end if;
  v_acquisition_kind := case
    when v_purchase.status = 'paid' then 'paid'
    when v_purchase.payment_provider = 'free_acquisition' then 'free'
    when v_purchase.payment_provider = 'admin_grant' then 'admin'
    else null
  end;
  if v_acquisition_kind is null then
    raise exception 'unsupported market acquisition source';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    v_purchase.buyer_user_id::text || ':' || v_purchase.asset_id::text, 0
  ));

  select * into v_asset
  from public.market_assets
  where id = v_purchase.asset_id;
  if not found then raise exception 'market asset required'; end if;
  select * into v_series
  from public.market_asset_series
  where id = v_asset.series_id;
  if not found then raise exception 'market asset series required'; end if;

  select * into v_revision
  from public.market_asset_revisions
  where id = v_asset.active_revision_id
    and status = 'active';

  select id into v_entitlement_id
  from public.market_asset_entitlements
  where user_id = v_purchase.buyer_user_id
    and asset_id = v_purchase.asset_id
    and status = 'active'
  for update;
  if found then return v_entitlement_id; end if;

  v_snapshot := case
    when jsonb_typeof(coalesce(v_purchase.package_rights_snapshot -> 'license', '{}'::jsonb)) = 'object'
      and v_purchase.package_rights_snapshot -> 'license' <> '{}'::jsonb
      then v_purchase.package_rights_snapshot
    else jsonb_build_object(
      'schema', 'pixieed-market-entitlement/v1',
      'asset_id', v_asset.id,
      'license', jsonb_build_object(
        'derivative_sales_allowed', v_series.derivative_sales_allowed,
        'inherited_terms', v_series.inherited_terms,
        'prohibited_uses', v_series.prohibited_uses,
        'selected_option_ids', to_jsonb(coalesce(v_series.selected_option_ids, array[]::text[]))
      )
    )
  end;
  v_content_hash := coalesce(v_revision.content_hash, v_purchase.package_snapshot_hash);
  v_snapshot := v_snapshot
    || jsonb_build_object(
      'acquisition_kind', v_acquisition_kind,
      'source_revision_id', v_revision.id,
      'content_hash', v_content_hash,
      'license_id', 'market-license:' || v_purchase.id::text,
      'status', 'ACTIVE',
      'in_game_use', (
        'commercial-use' = any(coalesce(v_series.selected_option_ids, array[]::text[]))
        or 'game-app-use' = any(coalesce(v_series.selected_option_ids, array[]::text[]))
      ),
      'rights', to_jsonb(
        case
          when 'commercial-use' = any(coalesce(v_series.selected_option_ids, array[]::text[]))
            or 'game-app-use' = any(coalesce(v_series.selected_option_ids, array[]::text[]))
            then array_append(coalesce(v_series.selected_option_ids, array[]::text[]), 'in-game-use')
          else coalesce(v_series.selected_option_ids, array[]::text[])
        end
      ),
      'captured_at', timezone('utc', now())
    );

  insert into public.market_asset_entitlements (
    user_id, asset_id, purchase_id, revision_id, acquisition_kind,
    status, content_hash, license_snapshot, metadata
  ) values (
    v_purchase.buyer_user_id,
    v_purchase.asset_id,
    v_purchase.id,
    nullif(v_revision.id, '00000000-0000-0000-0000-000000000000'::uuid),
    v_acquisition_kind,
    'active',
    v_content_hash,
    v_snapshot,
    jsonb_build_object(
      'payment_provider', v_purchase.payment_provider,
      'purchase_status', v_purchase.status
    )
  )
  on conflict (user_id, asset_id) where status = 'active' do nothing
  returning id into v_entitlement_id;

  if v_entitlement_id is null then
    select id into v_entitlement_id
    from public.market_asset_entitlements
    where user_id = v_purchase.buyer_user_id
      and asset_id = v_purchase.asset_id
      and status = 'active';
  end if;
  if v_entitlement_id is null then raise exception 'market entitlement could not be materialized'; end if;

  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (
    nullif(auth.uid(), v_purchase.buyer_user_id),
    'market_entitlement_materialized',
    'market_entitlement',
    v_entitlement_id::text,
    jsonb_build_object(
      'purchase_id', v_purchase.id,
      'asset_id', v_purchase.asset_id,
      'acquisition_kind', v_acquisition_kind,
      'source_revision_id', v_revision.id,
      'content_hash', v_content_hash
    )
  );
  return v_entitlement_id;
end;
$$;

revoke all on function public.market_materialize_entitlement_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.market_materialize_entitlement_v1(uuid)
  to service_role;

create or replace function public.market_materialize_purchase_entitlement_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.purchase_kind = 'standard_use'
     and (
       new.status = 'paid'
       or (new.status = 'granted' and new.payment_provider in ('admin_grant', 'free_acquisition'))
     ) then
    perform public.market_materialize_entitlement_v1(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists market_purchases_materialize_entitlement on public.market_purchases;
create trigger market_purchases_materialize_entitlement
after insert or update of status, payment_provider, purchase_kind
on public.market_purchases
for each row execute function public.market_materialize_purchase_entitlement_trigger_v1();

create or replace function public.market_acquire_free_asset_v1(
  input_asset_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_asset public.market_assets%rowtype;
  v_series public.market_asset_series%rowtype;
  v_purchase public.market_purchases%rowtype;
  v_entitlement public.market_asset_entitlements%rowtype;
  v_revision public.market_asset_revisions%rowtype;
  v_provider_payment_id text;
begin
  if v_user_id is null or not public.market_current_user_has_confirmed_identity() then
    raise exception 'confirmed account login required';
  end if;
  if input_asset_id is null then raise exception 'market asset required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    v_user_id::text || ':' || input_asset_id::text, 0
  ));

  select * into v_asset
  from public.market_assets
  where id = input_asset_id
  for update;
  if not found or v_asset.status <> 'published' or v_asset.withdrawn_at is not null then
    raise exception 'published market asset required';
  end if;
  if v_asset.creator_user_id = v_user_id then
    raise exception 'creators cannot acquire their own asset';
  end if;
  if v_asset.sale_price_yen <> 0 then
    raise exception 'this market asset is not free';
  end if;
  select * into v_series
  from public.market_asset_series
  where id = v_asset.series_id
    and status = 'published';
  if not found then raise exception 'published market series required'; end if;

  select * into v_revision
  from public.market_asset_revisions
  where id = v_asset.active_revision_id
    and status = 'active';
  if not found or v_revision.content_hash is null then
    raise exception 'verified package revision required';
  end if;

  select * into v_entitlement
  from public.market_asset_entitlements
  where user_id = v_user_id and asset_id = v_asset.id and status = 'active'
  for update;
  if found then
    return jsonb_build_object(
      'ok', true, 'already_available', true,
      'asset_id', v_asset.id, 'entitlement_id', v_entitlement.id,
      'purchase_id', v_entitlement.purchase_id,
      'acquisition_kind', v_entitlement.acquisition_kind,
      'source_revision_id', v_entitlement.revision_id,
      'content_hash', v_entitlement.content_hash,
      'license', v_entitlement.license_snapshot
    );
  end if;

  -- An older administrator grant may predate the entitlement table. Reuse it
  -- instead of attempting a second granted purchase for the same user/asset.
  select * into v_purchase
  from public.market_purchases
  where buyer_user_id = v_user_id
    and asset_id = v_asset.id
    and status = 'granted'
    and payment_provider in ('admin_grant', 'free_acquisition')
  order by created_at desc
  limit 1;
  if found then
    perform public.market_materialize_entitlement_v1(v_purchase.id);
    select * into v_entitlement
    from public.market_asset_entitlements
    where user_id = v_user_id and asset_id = v_asset.id and status = 'active';
    if not found then raise exception 'existing grant entitlement was not created'; end if;
    return jsonb_build_object(
      'ok', true, 'already_available', true,
      'asset_id', v_asset.id, 'entitlement_id', v_entitlement.id,
      'purchase_id', v_entitlement.purchase_id,
      'acquisition_kind', v_entitlement.acquisition_kind,
      'source_revision_id', v_entitlement.revision_id,
      'content_hash', v_entitlement.content_hash,
      'license', v_entitlement.license_snapshot
    );
  end if;

  if exists (
    select 1 from public.market_purchases
    where buyer_user_id = v_user_id and asset_id = v_asset.id
      and status = 'pending' and provider_checkout_session_id is not null
  ) then
    raise exception 'a Stripe checkout is already in progress for this asset';
  end if;
  update public.market_purchases
  set status = 'cancelled', updated_at = timezone('utc', now())
  where buyer_user_id = v_user_id and asset_id = v_asset.id
    and status = 'pending' and provider_checkout_session_id is null;

  v_provider_payment_id := 'free:' || v_user_id::text || ':' || v_asset.id::text;
  insert into public.market_purchases (
    asset_id, buyer_user_id, purchase_kind, status, currency,
    gross_amount_yen, processor_fee_yen, platform_fee_yen,
    distributable_amount_yen, payment_provider, provider_payment_id
  ) values (
    v_asset.id, v_user_id, 'standard_use', 'granted', 'jpy',
    0, 0, 0, 0, 'free_acquisition', v_provider_payment_id
  )
  on conflict (payment_provider, provider_payment_id) do nothing;

  select * into v_purchase
  from public.market_purchases
  where payment_provider = 'free_acquisition'
    and provider_payment_id = v_provider_payment_id;
  if not found then raise exception 'free acquisition record was not created'; end if;
  perform public.market_materialize_entitlement_v1(v_purchase.id);

  select * into v_entitlement
  from public.market_asset_entitlements
  where user_id = v_user_id and asset_id = v_asset.id and status = 'active';
  if not found then raise exception 'free entitlement was not created'; end if;

  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (
    v_user_id, 'market_free_asset_acquired', 'market_asset', v_asset.id::text,
    jsonb_build_object('purchase_id', v_purchase.id, 'entitlement_id', v_entitlement.id)
  );
  return jsonb_build_object(
    'ok', true, 'already_available', false,
    'asset_id', v_asset.id, 'entitlement_id', v_entitlement.id,
    'purchase_id', v_purchase.id,
    'acquisition_kind', v_entitlement.acquisition_kind,
    'source_revision_id', v_entitlement.revision_id,
    'content_hash', v_entitlement.content_hash,
    'license', v_entitlement.license_snapshot
  );
end;
$$;

revoke all on function public.market_acquire_free_asset_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.market_acquire_free_asset_v1(uuid)
  to authenticated;

comment on function public.market_acquire_free_asset_v1(uuid) is
  'Atomically records a zero-yen acquisition and materializes the same entitlement contract used by paid delivery.';

-- ---------------------------------------------------------------------------
-- Free listings and the complete creator format surface
-- ---------------------------------------------------------------------------

-- A free listing is a deliberate zero-yen product. Other prices retain the
-- existing 500-yen floor and 100-yen step so Stripe and royalty invariants do
-- not silently widen.
create or replace function public.market_enforce_minimum_listing_price()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.sale_price_yen = 0 then
    return new;
  end if;
  if new.sale_price_yen < 500 or mod(new.sale_price_yen, 100) <> 0 then
    raise exception 'market listing price must be zero or at least 500 yen in 100 yen increments';
  end if;
  return new;
end;
$$;

alter table public.market_assets
  drop constraint if exists market_assets_published_minimum_price;
alter table public.market_assets
  add constraint market_assets_published_minimum_price
  check (status <> 'published' or sale_price_yen = 0 or sale_price_yen >= 500)
  not valid;

-- v8 is kept as the browser-facing signature. It preserves the legal and
-- seller gates, while delegating format/manifest construction to the final v3
-- registry implementation, which already supports a zero seller price.
create or replace function public.market_create_root_asset_v8(
  input_title text, input_description text, input_sale_price_yen integer,
  input_derivative_sales_allowed boolean, input_source_kind text, input_source_sha256 text,
  input_asset_formats text[], input_selected_option_ids text[], input_option_prices jsonb,
  input_provenance_manifest jsonb, input_inherited_terms jsonb, input_prohibited_uses jsonb,
  input_change_summary jsonb, input_terms_version text, input_privacy_version text,
  input_ai_usage_status text, input_terms_confirmed boolean, input_privacy_confirmed boolean,
  input_original_work_confirmed boolean, input_custom_options jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(input_sale_price_yen, -1) <> 0
     and (input_sale_price_yen < 500 or mod(input_sale_price_yen, 100) <> 0) then
    raise exception 'sale price must be zero or at least 500 yen in 100 yen increments';
  end if;
  if input_terms_version is distinct from '2026-07-19'
     or input_privacy_version is distinct from '2026-07-19'
     or input_ai_usage_status not in ('used', 'not-used')
     or input_terms_confirmed is not true
     or input_privacy_confirmed is not true
     or input_original_work_confirmed is not true then
    raise exception 'terms, privacy, AI usage, and original-work confirmation are required';
  end if;
  if jsonb_typeof(coalesce(input_option_prices, '{}'::jsonb)) <> 'object'
     or coalesce(input_option_prices, '{}'::jsonb) <> '{}'::jsonb then
    raise exception 'license options are included in the listing price and cannot have separate prices';
  end if;
  if jsonb_typeof(coalesce(input_custom_options, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(input_custom_options, '[]'::jsonb)) <> 0 then
    raise exception 'seller-priced custom options are not available';
  end if;
  return public.market_create_root_asset_v3(
    input_title, input_description, input_sale_price_yen,
    input_derivative_sales_allowed, input_source_kind, input_source_sha256,
    input_asset_formats, input_selected_option_ids, '{}'::jsonb,
    input_provenance_manifest, input_inherited_terms, input_prohibited_uses,
    input_change_summary
  );
end;
$$;

create or replace function public.market_create_derivative_draft_v5(
  input_source_asset_id uuid, input_derivative_license_id uuid, input_title text,
  input_description text, input_seller_price_yen integer, input_source_kind text,
  input_source_sha256 text, input_asset_formats text[], input_provenance_manifest jsonb,
  input_change_summary jsonb, input_terms_version text, input_privacy_version text,
  input_ai_usage_status text, input_terms_confirmed boolean, input_privacy_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(input_seller_price_yen, -1) <> 0
     and (input_seller_price_yen < 500 or mod(input_seller_price_yen, 100) <> 0) then
    raise exception 'derivative sale price must be zero or at least 500 yen in 100 yen increments';
  end if;
  return public.market_create_derivative_draft_v4(
    input_source_asset_id, input_derivative_license_id, input_title,
    input_description, input_seller_price_yen, input_source_kind,
    input_source_sha256, input_asset_formats, input_provenance_manifest,
    input_change_summary, input_terms_version, input_privacy_version,
    input_ai_usage_status, input_terms_confirmed, input_privacy_confirmed
  );
end;
$$;

revoke all on function public.market_create_root_asset_v8(text, text, integer, boolean, text, text, text[], text[], jsonb, jsonb, jsonb, jsonb, jsonb, text, text, text, boolean, boolean, boolean, jsonb)
  from public, anon, authenticated;
revoke all on function public.market_create_derivative_draft_v5(uuid, uuid, text, text, integer, text, text, text[], jsonb, jsonb, text, text, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.market_create_root_asset_v8(text, text, integer, boolean, text, text, text[], text[], jsonb, jsonb, jsonb, jsonb, jsonb, text, text, text, boolean, boolean, boolean, jsonb)
  to authenticated;
grant execute on function public.market_create_derivative_draft_v5(uuid, uuid, text, text, integer, text, text, text[], jsonb, jsonb, text, text, text, boolean, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Public catalog revision metadata and immutable purchase snapshots
-- ---------------------------------------------------------------------------

create or replace function public.market_capture_package_rights_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset public.market_assets%rowtype;
  v_series public.market_asset_series%rowtype;
  v_revision public.market_asset_revisions%rowtype;
  v_manifest jsonb;
begin
  select * into v_asset
  from public.market_assets
  where id = new.asset_id;
  if not found then raise exception 'market asset required for package snapshot'; end if;

  select * into v_series
  from public.market_asset_series
  where id = v_asset.series_id;
  if not found then raise exception 'market asset series required for package snapshot'; end if;

  select * into v_revision
  from public.market_asset_revisions
  where id = v_asset.active_revision_id
    and status = 'active';

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
    'source_revision_id', v_revision.id,
    'revision_number', v_revision.revision_number,
    'content_hash', v_revision.content_hash,
    'files', coalesce(v_manifest -> 'files', '[]'::jsonb),
    'storage_manifest_path', v_manifest -> 'storage_manifest_path',
    'storage_file_paths', coalesce(v_manifest -> 'storage_file_paths', '[]'::jsonb),
    'storage_sample_preview_paths', coalesce(v_manifest -> 'storage_sample_preview_paths', '[]'::jsonb),
    'license', jsonb_build_object(
      'license_id', 'market-license:' || new.id::text,
      'status', 'ACTIVE',
      'in_game_use', (
        'commercial-use' = any(coalesce(v_series.selected_option_ids, array[]::text[]))
        or 'game-app-use' = any(coalesce(v_series.selected_option_ids, array[]::text[]))
      ),
      'rights', to_jsonb(
        case
          when 'commercial-use' = any(coalesce(v_series.selected_option_ids, array[]::text[]))
            or 'game-app-use' = any(coalesce(v_series.selected_option_ids, array[]::text[]))
            then array_append(coalesce(v_series.selected_option_ids, array[]::text[]), 'in-game-use')
          else coalesce(v_series.selected_option_ids, array[]::text[])
        end
      ),
      'derivative_sales_allowed', v_series.derivative_sales_allowed,
      'inherited_terms', v_series.inherited_terms,
      'prohibited_uses', v_series.prohibited_uses,
      'selected_option_ids', to_jsonb(coalesce(v_series.selected_option_ids, array[]::text[]))
    )
  );
  new.package_snapshot_hash := coalesce(v_revision.content_hash, v_asset.package_hash);
  new.package_snapshot_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists market_purchases_capture_package_rights_snapshot on public.market_purchases;
create trigger market_purchases_capture_package_rights_snapshot
before insert on public.market_purchases
for each row execute function public.market_capture_package_rights_snapshot();

create or replace function public.market_public_catalog_v1(input_limit integer default 120)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(catalog.asset order by catalog.published_at desc nulls last), '[]'::jsonb)
  from (
    select asset.published_at, jsonb_build_object(
      'id', asset.id,
      'parent_asset_id', asset.parent_asset_id,
      'creator_display_name', asset.creator_display_name,
      'creator_profile_url', asset.creator_profile_url,
      'title', asset.title,
      'description', asset.description,
      'sale_price_yen', asset.sale_price_yen,
      'free_acquisition_available', asset.sale_price_yen = 0,
      'rights', case
        when 'commercial-use' = any(coalesce(series.selected_option_ids, array[]::text[]))
          or 'game-app-use' = any(coalesce(series.selected_option_ids, array[]::text[]))
          then jsonb_build_array('in-game-use')
        else '[]'::jsonb
      end,
      'asset_format', asset.asset_format,
      'included_formats', asset.included_formats,
      'media_kinds', coalesce((
        select jsonb_agg(k.media_kind order by k.media_kind)
        from (
          select distinct formats.media_kind
          from public.market_asset_formats as formats
          where formats.id = any(coalesce(asset.included_formats, array[]::text[]))
        ) as k
      ), '[]'::jsonb),
      'ai_usage_status', asset.ai_usage_status,
      'tags', asset.tags,
      'favorite_count', asset.favorite_count,
      'derivative_count', asset.derivative_count,
      'limited_quantity', asset.limited_quantity,
      'limited_sold_count', asset.limited_sold_count,
      'published_at', asset.published_at,
      'source_kind', asset.source_kind,
      'verification_status', asset.verification_status,
      'verification_level', asset.verification_level,
      'seller_identity_verified', asset.seller_identity_verified,
      'package_revision', case when revision.id is null then null else jsonb_build_object(
        'id', revision.id,
        'number', revision.revision_number,
        'content_hash', revision.content_hash,
        'source_sha256', revision.source_sha256,
        'package_hash', revision.package_hash
      ) end,
      'series', jsonb_build_object(
        'required_option_price_yen', series.required_option_price_yen,
        'derivative_sales_allowed', series.derivative_sales_allowed,
        'inherited_terms', series.inherited_terms
      )
    ) as asset
    from public.market_assets as asset
    join public.market_asset_series as series on series.id = asset.series_id
    left join public.market_asset_revisions as revision
      on revision.id = asset.active_revision_id and revision.status = 'active'
    where asset.status = 'published'
      and series.status = 'published'
      and asset.withdrawn_at is null
      and (asset.limited_quantity is null or asset.limited_quantity <= 0
        or coalesce(asset.limited_sold_count, 0) < asset.limited_quantity)
    order by asset.published_at desc nulls last
    limit greatest(1, least(coalesce(input_limit, 120), 120))
  ) as catalog;
$$;

create or replace function public.market_public_asset_v1(input_asset_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', asset.id,
    'parent_asset_id', asset.parent_asset_id,
    'creator_display_name', asset.creator_display_name,
    'creator_profile_url', asset.creator_profile_url,
    'title', asset.title,
    'description', asset.description,
    'sale_price_yen', asset.sale_price_yen,
    'free_acquisition_available', asset.sale_price_yen = 0,
    'rights', case
      when 'commercial-use' = any(coalesce(series.selected_option_ids, array[]::text[]))
        or 'game-app-use' = any(coalesce(series.selected_option_ids, array[]::text[]))
        then jsonb_build_array('in-game-use')
      else '[]'::jsonb
    end,
    'asset_format', asset.asset_format,
    'included_formats', asset.included_formats,
    'media_kinds', coalesce((
      select jsonb_agg(k.media_kind order by k.media_kind)
      from (
        select distinct formats.media_kind
        from public.market_asset_formats as formats
        where formats.id = any(coalesce(asset.included_formats, array[]::text[]))
      ) as k
    ), '[]'::jsonb),
    'ai_usage_status', asset.ai_usage_status,
    'tags', asset.tags,
    'favorite_count', asset.favorite_count,
    'derivative_count', asset.derivative_count,
    'limited_quantity', asset.limited_quantity,
    'limited_sold_count', asset.limited_sold_count,
    'published_at', asset.published_at,
    'source_kind', asset.source_kind,
    'verification_status', asset.verification_status,
    'verification_level', asset.verification_level,
    'seller_identity_verified', asset.seller_identity_verified,
    'package_revision', case when revision.id is null then null else jsonb_build_object(
      'id', revision.id,
      'number', revision.revision_number,
      'content_hash', revision.content_hash,
      'source_sha256', revision.source_sha256,
      'package_hash', revision.package_hash
    ) end,
    'series', jsonb_build_object(
      'required_option_price_yen', series.required_option_price_yen,
      'derivative_sales_allowed', series.derivative_sales_allowed,
      'inherited_terms', series.inherited_terms
    )
  )
  from public.market_assets as asset
  join public.market_asset_series as series on series.id = asset.series_id
  left join public.market_asset_revisions as revision
    on revision.id = asset.active_revision_id and revision.status = 'active'
  where asset.id = input_asset_id
    and asset.status = 'published'
    and series.status = 'published'
    and asset.withdrawn_at is null
    and (asset.limited_quantity is null or asset.limited_quantity <= 0
      or coalesce(asset.limited_sold_count, 0) < asset.limited_quantity);
$$;

create or replace function public.market_public_seo_catalog_v1()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(catalog.asset order by catalog.published_at desc nulls last), '[]'::jsonb)
  from (
    select asset.published_at, jsonb_build_object(
      'id', asset.id,
      'creator_display_name', asset.creator_display_name,
      'creator_profile_url', asset.creator_profile_url,
      'title', asset.title,
      'description', asset.description,
      'sale_price_yen', asset.sale_price_yen,
      'free_acquisition_available', asset.sale_price_yen = 0,
      'rights', case
        when 'commercial-use' = any(coalesce(series.selected_option_ids, array[]::text[]))
          or 'game-app-use' = any(coalesce(series.selected_option_ids, array[]::text[]))
          then jsonb_build_array('in-game-use')
        else '[]'::jsonb
      end,
      'asset_format', asset.asset_format,
      'included_formats', asset.included_formats,
      'tags', asset.tags,
      'limited_quantity', asset.limited_quantity,
      'limited_sold_count', asset.limited_sold_count,
      'published_at', asset.published_at,
      'package_revision', case when revision.id is null then null else jsonb_build_object(
        'id', revision.id,
        'number', revision.revision_number,
        'content_hash', revision.content_hash
      ) end,
      'series', jsonb_build_object(
        'required_option_price_yen', series.required_option_price_yen,
        'derivative_sales_allowed', series.derivative_sales_allowed,
        'inherited_terms', series.inherited_terms
      )
    ) as asset
    from public.market_assets as asset
    join public.market_asset_series as series on series.id = asset.series_id
    left join public.market_asset_revisions as revision
      on revision.id = asset.active_revision_id and revision.status = 'active'
    where asset.status = 'published'
      and series.status = 'published'
      and asset.withdrawn_at is null
    order by asset.published_at desc nulls last
  ) as catalog;
$$;

revoke all on function public.market_capture_package_rights_snapshot() from public, anon, authenticated;
revoke all on function public.market_public_catalog_v1(integer) from public, anon, authenticated;
revoke all on function public.market_public_asset_v1(uuid) from public, anon, authenticated;
revoke all on function public.market_public_seo_catalog_v1() from public, anon, authenticated;
grant execute on function public.market_public_catalog_v1(integer) to anon, authenticated;
grant execute on function public.market_public_asset_v1(uuid) to anon, authenticated;
grant execute on function public.market_public_seo_catalog_v1() to anon, authenticated;
