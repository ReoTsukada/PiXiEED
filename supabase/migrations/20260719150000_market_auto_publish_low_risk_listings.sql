-- DEV beta: publish straightforward self-declared original works immediately.
-- AI-assisted and derivative works keep the manual review path because their
-- provenance or licence relationship can need a human decision.

alter table public.market_assets
  drop constraint if exists market_assets_verification_status_check;
alter table public.market_assets
  add constraint market_assets_verification_status_check
  check (verification_status in ('pending', 'self-declared', 'verified', 'rejected', 'revoked'));

alter table public.market_assets
  drop constraint if exists market_assets_verification_level_check;
alter table public.market_assets
  add constraint market_assets_verification_level_check
  check (verification_level in ('unverified', 'external-self-declared', 'pixieed-native', 'external-reviewed'));

-- Keep the original package validation implementation intact and add the
-- publish/review decision around it.  The outer function is intentionally
-- idempotent: a mobile client may lose the response after the server has
-- already finished attaching and publishing the package.
alter function public.market_attach_listing_package(uuid, text, text[], text, text[])
  rename to market_attach_listing_package_v1;

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
begin
  select * into v_asset
  from public.market_assets
  where id = input_asset_id and creator_user_id = auth.uid()
  for update;
  if not found then raise exception 'editable draft not found'; end if;

  -- A retry after a lost HTTP response is a success when this exact package
  -- has already been finalized by an earlier request.
  if v_asset.status in ('review', 'published')
     and v_asset.asset_object_path = input_manifest_object_path then
    return;
  end if;
  if v_asset.status <> 'draft' then raise exception 'editable draft not found'; end if;

  perform public.market_attach_listing_package_v1(
    input_asset_id,
    input_manifest_object_path,
    input_file_object_paths,
    input_preview_object_path,
    input_sample_preview_paths
  );

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
    jsonb_build_object('reason', case when v_needs_review then 'ai_or_derivative' else 'self_declared_original' end)
  );
end;
$$;

revoke all on function public.market_attach_listing_package(uuid, text, text[], text, text[])
  from public, anon, authenticated;
grant execute on function public.market_attach_listing_package(uuid, text, text[], text, text[])
  to authenticated;

-- The DEV beta seller gate no longer requires an operator-approved seller
-- profile.  Keep reviewer-role and clean-file checks for the smaller manual
-- review queue, but do not reject its approval for that obsolete condition.
create or replace function public.market_review_listing(
  input_asset_id uuid,
  input_decision text,
  input_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset public.market_assets%rowtype;
begin
  if not public.market_current_user_is_reviewer() then
    raise exception 'reviewer permission required';
  end if;
  if input_decision not in ('approved', 'rejected', 'suspended') then
    raise exception 'invalid review decision';
  end if;

  select * into v_asset from public.market_assets where id = input_asset_id for update;
  if not found then raise exception 'asset not found'; end if;

  if input_decision = 'approved' then
    if v_asset.source_sha256 is null or v_asset.file_scan_status <> 'clean' then
      raise exception 'clean verified source file required';
    end if;
    update public.market_assets
    set status = 'published', verification_status = 'verified',
        verification_level = case when source_kind = 'pixieed-native' then 'pixieed-native' else 'external-reviewed' end,
        seller_identity_verified = true, verified_at = timezone('utc', now()), verified_by = auth.uid(),
        published_at = coalesce(published_at, timezone('utc', now()))
    where id = input_asset_id;
    update public.market_asset_series set status = 'published', updated_at = timezone('utc', now())
    where root_asset_id = input_asset_id;
  elsif input_decision = 'rejected' then
    update public.market_assets
    set status = 'rejected', verification_status = 'rejected', verified_at = timezone('utc', now()), verified_by = auth.uid()
    where id = input_asset_id;
  else
    update public.market_assets
    set status = 'suspended', verification_status = 'revoked', seller_identity_verified = false,
        verified_at = timezone('utc', now()), verified_by = auth.uid()
    where id = input_asset_id;
  end if;

  insert into public.market_listing_reviews(asset_id, reviewer_user_id, decision, reason)
  values (input_asset_id, auth.uid(), input_decision, coalesce(input_reason, ''));
  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'listing_reviewed', 'market_asset', input_asset_id::text,
    jsonb_build_object('decision', input_decision, 'reason', coalesce(input_reason, '')));
end;
$$;

-- Apply the same classification to any already-complete low-risk drafts so
-- they are not stranded in the former all-manual-review workflow.
with auto_publish as (
  update public.market_assets
  set status = 'published',
      verification_status = 'self-declared',
      verification_level = 'external-self-declared',
      published_at = coalesce(published_at, timezone('utc', now())),
      updated_at = timezone('utc', now())
  where status in ('draft', 'review')
    and parent_asset_id is null
    and ai_usage_status = 'not-used'
    and asset_object_path is not null
    and source_sha256 is not null
  returning id
)
update public.market_asset_series series
set status = 'published', updated_at = timezone('utc', now())
where series.root_asset_id in (select id from auto_publish);
