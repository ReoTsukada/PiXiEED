create or replace function public.pixieed_shared_project_member_limit_for_owner(
  input_owner_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_user_id uuid := input_owner_user_id;
  v_now timestamptz := timezone('utc', now());
begin
  if v_owner_user_id is null then
    return 2;
  end if;

  if exists (
    select 1
    from public.user_entitlements entitlements
    where entitlements.user_id = v_owner_user_id
      and entitlements.entitlement_key in ('pixiedraw_ad_free', 'browser_ad_free')
      and entitlements.revoked_at is null
      and coalesce(entitlements.status, 'active') = 'active'
      and (
        entitlements.expires_at is null
        or entitlements.expires_at > v_now
      )
  ) then
    return 4;
  end if;

  return 2;
end;
$$;

revoke all on function public.pixieed_shared_project_member_limit_for_owner(uuid) from public, anon, authenticated;

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
  already_member boolean := false;
  member_count integer := 0;
  member_limit integer := 2;
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

  select exists (
    select 1
    from public.shared_project_members as members
    where members.project_key = project_row.project_key
      and members.user_id = current_user_id
  )
  into already_member;

  if next_role <> 'owner' and not already_member then
    select count(*)
    into member_count
    from (
      select project_row.owner_user_id as user_id
      union
      select members.user_id
      from public.shared_project_members as members
      where members.project_key = project_row.project_key
    ) as project_users;

    member_limit := public.pixieed_shared_project_member_limit_for_owner(project_row.owner_user_id);

    if member_count >= member_limit then
      raise exception 'shared_project_member_limit_reached';
    end if;
  end if;

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
  already_member boolean := false;
  member_count integer := 0;
  member_limit integer := 2;
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

  select exists (
    select 1
    from public.shared_project_members as members
    where members.project_key = project_row.project_key
      and members.user_id = current_user_id
  )
  into already_member;

  if next_role <> 'owner' and not already_member then
    select count(*)
    into member_count
    from (
      select project_row.owner_user_id as user_id
      union
      select members.user_id
      from public.shared_project_members as members
      where members.project_key = project_row.project_key
    ) as project_users;

    member_limit := public.pixieed_shared_project_member_limit_for_owner(project_row.owner_user_id);

    if member_count >= member_limit then
      raise exception 'shared_project_member_limit_reached';
    end if;
  end if;

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

revoke all on function public.pixieed_ensure_shared_project_membership(text, text, text, text, boolean) from public;
grant execute on function public.pixieed_ensure_shared_project_membership(text, text, text, text, boolean) to authenticated;

revoke all on function public.pixieed_join_shared_project_by_invite_token(text) from public;
grant execute on function public.pixieed_join_shared_project_by_invite_token(text) to authenticated;
