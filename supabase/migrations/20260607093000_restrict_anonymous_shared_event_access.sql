create or replace function public.pixieed_is_anonymous_user()
returns boolean
language sql
stable
as $$
  select
    lower(coalesce(auth.jwt() ->> 'is_anonymous', 'false')) in ('true', 't', '1')
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', '') = 'anonymous';
$$;

revoke all on function public.pixieed_is_anonymous_user() from public, anon, authenticated;
grant execute on function public.pixieed_is_anonymous_user() to authenticated;

drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own"
on public.user_profiles
for insert
to authenticated
with check (
  auth.uid() = id
  and not public.pixieed_is_anonymous_user()
);

drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own"
on public.user_profiles
for update
to authenticated
using (
  auth.uid() = id
  and not public.pixieed_is_anonymous_user()
)
with check (
  auth.uid() = id
  and not public.pixieed_is_anonymous_user()
);

drop policy if exists "shared_project_members_insert_self" on public.shared_project_members;
create policy "shared_project_members_insert_self"
on public.shared_project_members
for insert
to authenticated
with check (
  user_id = auth.uid()
  and role = 'editor'
  and exists (
    select 1
    from public.shared_projects as projects
    where projects.project_key = shared_project_members.project_key
      and (
        not public.pixieed_is_anonymous_user()
        or projects.visibility = 'public'
      )
  )
);

drop policy if exists "shared_project_members_update_owner" on public.shared_project_members;
drop policy if exists "shared_project_members_update_owner_or_self" on public.shared_project_members;
create policy "shared_project_members_update_owner_or_self"
on public.shared_project_members
for update
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.shared_projects as projects
    where projects.project_key = shared_project_members.project_key
      and projects.owner_user_id = auth.uid()
  )
)
with check (
  (
    user_id = auth.uid()
    and role in ('editor', 'viewer')
    and exists (
      select 1
      from public.shared_projects as projects
      where projects.project_key = shared_project_members.project_key
        and (
          not public.pixieed_is_anonymous_user()
          or projects.visibility = 'public'
        )
    )
  )
  or exists (
    select 1
    from public.shared_projects as projects
    where projects.project_key = shared_project_members.project_key
      and projects.owner_user_id = auth.uid()
      and not public.pixieed_is_anonymous_user()
  )
);

create or replace function public.pixieed_get_shared_project_by_invite_token(
  target_invite_token text
)
returns table (
  id uuid,
  project_key text,
  invite_token text,
  visibility text,
  owner_user_id uuid,
  title text,
  latest_snapshot jsonb,
  latest_revision bigint,
  latest_structure_revision bigint,
  latest_snapshot_revision bigint,
  latest_snapshot_structure_revision bigint,
  updated_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_invite_token text := nullif(btrim(coalesce(target_invite_token, '')), '');
  current_user_id uuid := auth.uid();
  is_anonymous_user boolean := public.pixieed_is_anonymous_user();
  project_row public.shared_projects%rowtype;
begin
  if normalized_invite_token is null then
    return;
  end if;

  select projects.*
  into project_row
  from public.shared_projects as projects
  where nullif(btrim(coalesce(projects.invite_token, '')), '') = normalized_invite_token;

  if not found then
    return;
  end if;

  if project_row.visibility <> 'public' then
    if current_user_id is null or is_anonymous_user then
      return;
    end if;

    if not (
      project_row.owner_user_id = current_user_id
      or exists (
        select 1
        from public.shared_project_members as members
        where members.project_key = project_row.project_key
          and members.user_id = current_user_id
      )
    ) then
      return;
    end if;
  end if;

  return query
  select
    project_row.id,
    project_row.project_key,
    project_row.invite_token,
    project_row.visibility,
    project_row.owner_user_id,
    project_row.title,
    project_row.latest_snapshot,
    project_row.latest_revision,
    project_row.latest_structure_revision,
    project_row.latest_snapshot_revision,
    project_row.latest_snapshot_structure_revision,
    project_row.updated_at,
    project_row.created_at;
end;
$$;

revoke all on function public.pixieed_get_shared_project_by_invite_token(text) from public;
grant execute on function public.pixieed_get_shared_project_by_invite_token(text) to anon, authenticated;

create or replace function public.pixieed_ensure_shared_project_membership(
  target_project_key text,
  target_title text default '',
  target_invite_token text default '',
  target_visibility text default 'shared',
  target_create_if_missing boolean default false
)
returns table (
  id uuid,
  project_key text,
  invite_token text,
  visibility text,
  owner_user_id uuid,
  title text,
  latest_snapshot jsonb,
  latest_revision bigint,
  latest_structure_revision bigint,
  latest_snapshot_revision bigint,
  latest_snapshot_structure_revision bigint,
  updated_at timestamptz,
  created_at timestamptz,
  membership_role text,
  can_edit boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  is_anonymous_user boolean := public.pixieed_is_anonymous_user();
  normalized_key text := nullif(btrim(coalesce(target_project_key, '')), '');
  normalized_title text := coalesce(target_title, '');
  normalized_invite_token text := nullif(btrim(coalesce(target_invite_token, '')), '');
  normalized_visibility text := case
    when target_visibility = 'public' then 'public'
    when target_visibility = 'private' then 'private'
    else 'shared'
  end;
  project_row public.shared_projects%rowtype;
  next_role text := 'editor';
begin
  if current_user_id is null or normalized_key is null then
    return;
  end if;

  if is_anonymous_user and target_create_if_missing then
    raise exception 'anonymous users cannot create shared projects';
  end if;

  if target_create_if_missing then
    insert into public.shared_projects (
      project_key,
      owner_user_id,
      title,
      invite_token,
      visibility
    )
    values (
      normalized_key,
      current_user_id,
      normalized_title,
      coalesce(normalized_invite_token, 'sp_' || replace(gen_random_uuid()::text, '-', '')),
      normalized_visibility
    )
    on conflict on constraint shared_projects_pkey do nothing;
  end if;

  select projects.*
  into project_row
  from public.shared_projects as projects
  where projects.project_key = normalized_key;

  if not found then
    return;
  end if;

  if is_anonymous_user and project_row.visibility <> 'public' then
    raise exception 'anonymous users cannot open limited shared projects';
  end if;

  if nullif(btrim(coalesce(project_row.invite_token, '')), '') is null then
    update public.shared_projects as projects
    set invite_token = coalesce(normalized_invite_token, 'sp_' || replace(gen_random_uuid()::text, '-', ''))
    where projects.project_key = project_row.project_key
    returning projects.*
    into project_row;
  end if;

  next_role := case
    when project_row.owner_user_id = current_user_id then 'owner'
    else 'editor'
  end;

  insert into public.shared_project_members (
    project_key,
    project_id,
    user_id,
    role,
    last_opened_at
  )
  values (
    project_row.project_key,
    project_row.id,
    current_user_id,
    next_role,
    timezone('utc', now())
  )
  on conflict on constraint shared_project_members_pkey do update
  set
    project_id = excluded.project_id,
    role = case
      when project_row.owner_user_id = current_user_id then 'owner'
      when shared_project_members.role = 'owner' then 'owner'
      else 'editor'
    end,
    last_opened_at = excluded.last_opened_at;

  select members.role
  into next_role
  from public.shared_project_members as members
  where members.project_key = project_row.project_key
    and members.user_id = current_user_id;

  return query
  select
    project_row.id,
    project_row.project_key,
    project_row.invite_token,
    project_row.visibility,
    project_row.owner_user_id,
    project_row.title,
    project_row.latest_snapshot,
    project_row.latest_revision,
    project_row.latest_structure_revision,
    project_row.latest_snapshot_revision,
    project_row.latest_snapshot_structure_revision,
    project_row.updated_at,
    project_row.created_at,
    next_role,
    (next_role in ('owner', 'editor'));
end;
$$;

create or replace function public.pixieed_join_shared_project_by_invite_token(
  target_invite_token text
)
returns table (
  id uuid,
  project_key text,
  invite_token text,
  visibility text,
  owner_user_id uuid,
  title text,
  latest_snapshot jsonb,
  latest_revision bigint,
  latest_structure_revision bigint,
  latest_snapshot_revision bigint,
  latest_snapshot_structure_revision bigint,
  updated_at timestamptz,
  created_at timestamptz,
  membership_role text,
  can_edit boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  is_anonymous_user boolean := public.pixieed_is_anonymous_user();
  normalized_invite_token text := nullif(btrim(coalesce(target_invite_token, '')), '');
  project_row public.shared_projects%rowtype;
  next_role text := 'editor';
begin
  if current_user_id is null or normalized_invite_token is null then
    return;
  end if;

  select projects.*
  into project_row
  from public.shared_projects as projects
  where nullif(btrim(coalesce(projects.invite_token, '')), '') = normalized_invite_token;

  if not found then
    return;
  end if;

  if is_anonymous_user and project_row.visibility <> 'public' then
    raise exception 'anonymous users cannot join limited shared projects';
  end if;

  next_role := case
    when project_row.owner_user_id = current_user_id then 'owner'
    else 'editor'
  end;

  insert into public.shared_project_members (
    project_key,
    project_id,
    user_id,
    role,
    last_opened_at
  )
  values (
    project_row.project_key,
    project_row.id,
    current_user_id,
    next_role,
    timezone('utc', now())
  )
  on conflict on constraint shared_project_members_pkey do update
  set
    project_id = excluded.project_id,
    role = case
      when project_row.owner_user_id = current_user_id then 'owner'
      when shared_project_members.role = 'owner' then 'owner'
      else 'editor'
    end,
    last_opened_at = excluded.last_opened_at;

  select members.role
  into next_role
  from public.shared_project_members as members
  where members.project_key = project_row.project_key
    and members.user_id = current_user_id;

  return query
  select
    project_row.id,
    project_row.project_key,
    project_row.invite_token,
    project_row.visibility,
    project_row.owner_user_id,
    project_row.title,
    project_row.latest_snapshot,
    project_row.latest_revision,
    project_row.latest_structure_revision,
    project_row.latest_snapshot_revision,
    project_row.latest_snapshot_structure_revision,
    project_row.updated_at,
    project_row.created_at,
    next_role,
    (next_role in ('owner', 'editor'));
end;
$$;

create or replace function public.claim_browser_adfree_purchase_code(input_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order_ref text := upper(regexp_replace(trim(coalesce(input_order_id, '')), '\s+', '', 'g'));
  v_now timestamptz := timezone('utc', now());
  v_purchase public.browser_adfree_purchase_orders%rowtype;
  v_code_row public.user_entitlement_codes%rowtype;
  v_already_claimed_by_user boolean := false;
  v_code_already_redeemed_by_user boolean := false;
  v_transfer_from_auto_grant boolean := false;
begin
  if v_user_id is null then
    raise exception 'login required';
  end if;

  if public.pixieed_is_anonymous_user() then
    raise exception 'permanent login required';
  end if;

  if v_order_ref = '' then
    raise exception 'order id is required';
  end if;

  select *
    into v_purchase
    from public.browser_adfree_purchase_orders
   where lower(trim(coalesce(payment_status, ''))) = any (array['paid', 'completed', 'confirmed', 'fulfilled'])
     and lower(trim(coalesce(product_key, ''))) in ('browser_ad_free', 'pixiedraw_ad_free', 'pixieed_support_monthly')
     and (
       upper(regexp_replace(coalesce(provider_order_id, ''), '\s+', '', 'g')) = v_order_ref
       or upper(regexp_replace(coalesce(metadata ->> 'payment_intent_id', ''), '\s+', '', 'g')) = v_order_ref
       or upper(regexp_replace(coalesce(metadata ->> 'subscription_id', ''), '\s+', '', 'g')) = v_order_ref
       or upper(coalesce(metadata::text, '')) like '%' || v_order_ref || '%'
       or upper(coalesce(raw_payload::text, '')) like '%' || v_order_ref || '%'
     )
   order by issued_at desc nulls last, created_at desc
   limit 1
   for update;

  if not found or coalesce(v_purchase.code, '') = '' then
    raise exception 'purchase not found';
  end if;

  select *
    into v_code_row
    from public.user_entitlement_codes
   where code = v_purchase.code
   for update;

  if not found or not coalesce(v_code_row.active, false) then
    raise exception 'code unavailable';
  end if;

  if v_code_row.expires_at is not null and v_code_row.expires_at <= v_now then
    raise exception 'code expired';
  end if;

  v_already_claimed_by_user := coalesce(v_purchase.claimed_by = v_user_id, false);
  v_code_already_redeemed_by_user := coalesce(v_code_row.redeemed_by = v_user_id, false);
  v_transfer_from_auto_grant := v_code_row.redeemed_by is not null
    and not v_code_already_redeemed_by_user
    and not coalesce(v_code_row.metadata ? 'manual_redeemed_at', false)
    and (
      coalesce(v_code_row.metadata ? 'auto_granted_at', false)
      or coalesce(v_code_row.metadata ? 'claimed_by_email_at', false)
      or coalesce(v_code_row.metadata ? 'auto_entitlement_granted_at', false)
    );

  if v_purchase.claimed_by is not null and not v_already_claimed_by_user and not v_transfer_from_auto_grant then
    raise exception 'purchase already claimed';
  end if;

  if v_code_row.redeemed_by is not null
     and not v_code_already_redeemed_by_user
     and not v_transfer_from_auto_grant then
    raise exception 'code already redeemed';
  end if;

  if v_code_row.redeemed_by is null
     and coalesce(v_code_row.redemption_count, 0) >= coalesce(v_code_row.max_redemptions, 1) then
    raise exception 'code already redeemed';
  end if;

  update public.browser_adfree_purchase_orders
     set claimed_at = coalesce(claimed_at, v_now),
         claimed_by = coalesce(claimed_by, v_user_id),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'claimed_by_payment_reference_at', v_now,
           'claimed_by_payment_reference', v_order_ref,
           'claimed_without_email_match_at', v_now,
           'claimed_without_email_match_user_id', v_user_id
         ),
         updated_at = v_now
   where id = v_purchase.id;

  return jsonb_build_object(
    'ok', true,
    'code', v_purchase.code,
    'order_id', v_purchase.provider_order_id,
    'product_key', v_purchase.product_key,
    'matched_reference', v_order_ref,
    'entitlement_key', v_code_row.entitlement_key,
    'code_expires_at', v_code_row.expires_at,
    'email_match_required', false
  );
end;
$$;

create or replace function public.redeem_browser_adfree_code(input_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := regexp_replace(upper(trim(coalesce(input_code, ''))), '[^A-Z0-9]', '', 'g');
  v_now timestamptz := timezone('utc', now());
  v_code_row public.user_entitlement_codes%rowtype;
  v_entitlement public.user_entitlements%rowtype;
  v_next_expires_at timestamptz := null;
  v_entitlement_key text := '';
  v_product_key text := '';
  v_linked_entitlement_key text := '';
  v_already_redeemed_by_user boolean := false;
  v_base_metadata jsonb;
begin
  if v_user_id is null then
    raise exception 'login required';
  end if;

  if public.pixieed_is_anonymous_user() then
    raise exception 'permanent login required';
  end if;

  if v_code = '' then
    raise exception 'code is required';
  end if;

  select *
    into v_code_row
    from public.user_entitlement_codes
   where code = v_code
   for update;

  if not found then
    raise exception 'code not found';
  end if;

  if not coalesce(v_code_row.active, false) then
    raise exception 'code inactive';
  end if;

  if v_code_row.expires_at is not null and v_code_row.expires_at <= v_now then
    raise exception 'code expired';
  end if;

  v_already_redeemed_by_user := coalesce(v_code_row.redeemed_by = v_user_id, false);
  if v_code_row.redeemed_by is not null and not v_already_redeemed_by_user then
    raise exception 'code already redeemed';
  end if;

  if not v_already_redeemed_by_user
     and coalesce(v_code_row.redemption_count, 0) >= coalesce(v_code_row.max_redemptions, 1) then
    raise exception 'code already redeemed';
  end if;

  v_entitlement_key := lower(trim(coalesce(v_code_row.entitlement_key, '')));
  if v_entitlement_key not in ('browser_ad_free', 'pixiedraw_ad_free') then
    raise exception 'unsupported entitlement key';
  end if;

  select *
    into v_entitlement
    from public.user_entitlements
   where user_id = v_user_id
     and entitlement_key = v_entitlement_key
   for update;

  if v_already_redeemed_by_user and found then
    v_next_expires_at := v_entitlement.expires_at;
  elsif found and v_entitlement.revoked_at is null and v_entitlement.status = 'active' and v_entitlement.expires_at is null then
    v_next_expires_at := null;
  else
    v_next_expires_at := greatest(coalesce(v_entitlement.expires_at, v_now), v_now)
      + make_interval(days => greatest(coalesce(v_code_row.duration_days, 31), 1));
  end if;

  v_product_key := lower(trim(coalesce(v_code_row.metadata ->> 'product_key', '')));
  if v_product_key = 'pixieed_support_monthly' then
    v_linked_entitlement_key := case
      when v_entitlement_key = 'browser_ad_free' then 'pixiedraw_ad_free'
      else 'browser_ad_free'
    end;
  end if;

  v_base_metadata := jsonb_build_object(
    'last_redeemed_code', v_code,
    'last_redeemed_at', v_now,
    'product_key', v_product_key
  );

  perform public.pixieed_upsert_purchase_entitlement(
    v_user_id,
    v_entitlement_key,
    'code',
    v_next_expires_at,
    v_now,
    v_code,
    v_base_metadata
  );

  if v_linked_entitlement_key <> '' then
    perform public.pixieed_upsert_purchase_entitlement(
      v_user_id,
      v_linked_entitlement_key,
      'code',
      v_next_expires_at,
      v_now,
      v_code,
      v_base_metadata || jsonb_build_object(
        'linked_primary_entitlement_key', v_entitlement_key,
        'supplemental_for_product_key', 'pixieed_support_monthly'
      )
    );
  end if;

  update public.user_entitlement_codes
     set redemption_count = case
           when v_already_redeemed_by_user then coalesce(redemption_count, 0)
           else coalesce(redemption_count, 0) + 1
         end,
         redeemed_by = coalesce(redeemed_by, v_user_id),
         redeemed_at = coalesce(redeemed_at, v_now),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'last_redeemed_at', v_now,
           'linked_entitlement_key', nullif(v_linked_entitlement_key, '')
         ),
         updated_at = v_now
   where code = v_code;

  return jsonb_build_object(
    'ok', true,
    'entitlement_key', v_entitlement_key,
    'linked_entitlement_key', nullif(v_linked_entitlement_key, ''),
    'expires_at', v_next_expires_at,
    'redeemed_code', v_code
  );
end;
$$;

revoke all on function public.claim_browser_adfree_purchase_code(text) from public, anon;
grant execute on function public.claim_browser_adfree_purchase_code(text) to authenticated;

revoke all on function public.redeem_browser_adfree_code(text) from public, anon;
grant execute on function public.redeem_browser_adfree_code(text) to authenticated;
