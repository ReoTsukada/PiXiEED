insert into public.shared_project_members (
  project_key,
  project_id,
  user_id,
  role,
  last_opened_at
)
select
  projects.project_key,
  projects.id,
  projects.owner_user_id,
  'owner',
  timezone('utc', now())
from public.shared_projects as projects
where projects.owner_user_id is not null
on conflict on constraint shared_project_members_pkey do update
set
  project_id = excluded.project_id,
  role = 'owner',
  last_opened_at = coalesce(public.shared_project_members.last_opened_at, excluded.last_opened_at);

drop function if exists public.pixieed_ensure_shared_project_membership(text, text, text, text, boolean);
create function public.pixieed_ensure_shared_project_membership(
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
  can_edit boolean,
  join_policy text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_key text := nullif(trim(target_project_key), '');
  normalized_title text := coalesce(target_title, '');
  normalized_invite_token text := nullif(trim(target_invite_token), '');
  normalized_visibility text := case
    when target_visibility = 'public' then 'public'
    when target_visibility = 'shared' then 'shared'
    else 'shared'
  end;
  existing_role text := '';
  next_role text := '';
  project_row public.shared_projects%rowtype;
begin
  if current_user_id is null or normalized_key is null then
    return;
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

  if nullif(trim(project_row.invite_token), '') is null then
    update public.shared_projects as projects
    set invite_token = coalesce(normalized_invite_token, 'sp_' || replace(gen_random_uuid()::text, '-', ''))
    where projects.project_key = project_row.project_key
    returning *
    into project_row;
  end if;

  select members.role
  into existing_role
  from public.shared_project_members as members
  where members.project_key = project_row.project_key
    and members.user_id = current_user_id;

  next_role := case
    when project_row.owner_user_id = current_user_id then 'owner'
    when existing_role in ('owner', 'editor', 'viewer') then existing_role
    when coalesce(project_row.join_policy, 'open') = 'approval' then 'pending'
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
      when shared_project_members.role in ('owner', 'editor', 'viewer') then shared_project_members.role
      else excluded.role
    end,
    last_opened_at = excluded.last_opened_at;

  select role
  into next_role
  from public.shared_project_members
  where project_key = project_row.project_key
    and user_id = current_user_id;

  return query
  select
    project_row.id,
    project_row.project_key,
    project_row.invite_token,
    project_row.visibility,
    project_row.owner_user_id,
    project_row.title,
    case when next_role in ('owner', 'editor', 'viewer') then project_row.latest_snapshot else null::jsonb end,
    project_row.latest_revision,
    project_row.latest_structure_revision,
    project_row.latest_snapshot_revision,
    project_row.latest_snapshot_structure_revision,
    project_row.updated_at,
    project_row.created_at,
    next_role,
    (next_role in ('owner', 'editor')),
    project_row.join_policy;
end;
$$;

drop function if exists public.pixieed_join_shared_project_by_invite_token(text);
create function public.pixieed_join_shared_project_by_invite_token(
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
  can_edit boolean,
  join_policy text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_invite_token text := nullif(trim(target_invite_token), '');
  existing_role text := '';
  next_role text := '';
  project_row public.shared_projects%rowtype;
begin
  if current_user_id is null or normalized_invite_token is null then
    return;
  end if;

  select projects.*
  into project_row
  from public.shared_projects as projects
  where nullif(trim(projects.invite_token), '') = normalized_invite_token;

  if not found then
    return;
  end if;

  select members.role
  into existing_role
  from public.shared_project_members as members
  where members.project_key = project_row.project_key
    and members.user_id = current_user_id;

  next_role := case
    when project_row.owner_user_id = current_user_id then 'owner'
    when existing_role in ('owner', 'editor', 'viewer') then existing_role
    when coalesce(project_row.join_policy, 'open') = 'approval' then 'pending'
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
      when shared_project_members.role in ('owner', 'editor', 'viewer') then shared_project_members.role
      else excluded.role
    end,
    last_opened_at = excluded.last_opened_at;

  select role
  into next_role
  from public.shared_project_members
  where project_key = project_row.project_key
    and user_id = current_user_id;

  return query
  select
    project_row.id,
    project_row.project_key,
    project_row.invite_token,
    project_row.visibility,
    project_row.owner_user_id,
    project_row.title,
    case when next_role in ('owner', 'editor', 'viewer') then project_row.latest_snapshot else null::jsonb end,
    project_row.latest_revision,
    project_row.latest_structure_revision,
    project_row.latest_snapshot_revision,
    project_row.latest_snapshot_structure_revision,
    project_row.updated_at,
    project_row.created_at,
    next_role,
    (next_role in ('owner', 'editor')),
    project_row.join_policy;
end;
$$;

create or replace function public.pixieed_update_shared_project_join_policy(
  target_project_key text,
  next_join_policy text
)
returns table (
  project_key text,
  join_policy text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_project_key text := nullif(trim(target_project_key), '');
  normalized_join_policy text := case when next_join_policy = 'approval' then 'approval' else 'open' end;
begin
  if current_user_id is null or normalized_project_key is null then
    return;
  end if;

  if normalized_join_policy = 'open' then
    update public.shared_project_members as members
    set role = 'editor'
    from public.shared_projects as projects
    where projects.project_key = normalized_project_key
      and projects.owner_user_id = current_user_id
      and members.project_key = projects.project_key
      and members.role = 'pending';
  end if;

  return query
  update public.shared_projects as projects
  set join_policy = normalized_join_policy
  where projects.project_key = normalized_project_key
    and projects.owner_user_id = current_user_id
  returning projects.project_key, projects.join_policy;
end;
$$;

revoke all on function public.pixieed_ensure_shared_project_membership(text, text, text, text, boolean) from public;
grant execute on function public.pixieed_ensure_shared_project_membership(text, text, text, text, boolean) to authenticated;

revoke all on function public.pixieed_join_shared_project_by_invite_token(text) from public;
grant execute on function public.pixieed_join_shared_project_by_invite_token(text) to authenticated;

revoke all on function public.pixieed_update_shared_project_join_policy(text, text) from public;
grant execute on function public.pixieed_update_shared_project_join_policy(text, text) to authenticated;
