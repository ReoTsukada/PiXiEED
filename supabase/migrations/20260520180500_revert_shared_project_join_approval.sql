update public.shared_project_members
set role = 'editor'
where role = 'pending';

drop function if exists public.pixieed_update_shared_project_join_policy(text, text);
drop function if exists public.pixieed_approve_shared_project_member(text, uuid);

alter table public.shared_project_members
  drop constraint if exists shared_project_members_role_check;

alter table public.shared_project_members
  add constraint shared_project_members_role_check
  check (role in ('owner', 'editor', 'viewer'));

drop policy if exists "shared_project_members_insert_self" on public.shared_project_members;
create policy "shared_project_members_insert_self"
on public.shared_project_members
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.shared_projects as projects
    where projects.project_key = shared_project_members.project_key
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
  user_id = auth.uid()
  or exists (
    select 1
    from public.shared_projects as projects
    where projects.project_key = shared_project_members.project_key
      and projects.owner_user_id = auth.uid()
  )
);

create or replace function public.pixieed_can_access_shared_project(target_project_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shared_projects projects
    where projects.project_key = target_project_key
      and (
        projects.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.shared_project_members members
          where members.project_key = target_project_key
            and members.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.pixieed_can_access_shared_project_id(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shared_projects projects
    where projects.id = target_project_id
      and (
        projects.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.shared_project_members members
          where members.project_key = projects.project_key
            and members.user_id = auth.uid()
        )
      )
  );
$$;

drop function if exists public.pixieed_get_shared_project(text);
create function public.pixieed_get_shared_project(
  target_project_key text
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
  latest_snapshot_at timestamptz,
  latest_op_seq bigint,
  checkpoint_seq bigint,
  checkpoint_created_at timestamptz,
  membership_role text,
  can_edit boolean,
  updated_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_project_key text := nullif(trim(target_project_key), '');
  current_user_id uuid := auth.uid();
begin
  if normalized_project_key is null or current_user_id is null then
    return;
  end if;

  if not public.pixieed_can_access_shared_project(normalized_project_key) then
    return;
  end if;

  return query
  select
    projects.id,
    projects.project_key,
    projects.invite_token,
    projects.visibility,
    projects.owner_user_id,
    projects.title,
    projects.latest_snapshot,
    projects.latest_revision,
    projects.latest_structure_revision,
    projects.latest_snapshot_revision,
    projects.latest_snapshot_structure_revision,
    projects.latest_snapshot_at,
    projects.latest_op_seq,
    projects.checkpoint_seq,
    projects.checkpoint_created_at,
    coalesce(members.role, case when projects.owner_user_id = current_user_id then 'owner' else '' end) as membership_role,
    (projects.owner_user_id = current_user_id or coalesce(members.role, '') in ('owner', 'editor')) as can_edit,
    projects.updated_at,
    projects.created_at
  from public.shared_projects as projects
  left join public.shared_project_members as members
    on members.project_id = projects.id
   and members.user_id = current_user_id
  where projects.project_key = normalized_project_key
  limit 1;
end;
$$;

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
  created_at timestamptz
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
    case when project_row.owner_user_id = current_user_id then 'owner' else 'editor' end,
    timezone('utc', now())
  )
  on conflict on constraint shared_project_members_pkey do update
  set
    project_id = excluded.project_id,
    role = excluded.role,
    last_opened_at = excluded.last_opened_at;

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

drop function if exists public.pixieed_get_shared_project_by_invite_token(text);
create function public.pixieed_get_shared_project_by_invite_token(
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
  normalized_invite_token text := nullif(trim(target_invite_token), '');
begin
  if normalized_invite_token is null then
    return;
  end if;

  return query
  select
    projects.id,
    projects.project_key,
    projects.invite_token,
    projects.visibility,
    projects.owner_user_id,
    projects.title,
    projects.latest_snapshot,
    projects.latest_revision,
    projects.latest_structure_revision,
    projects.latest_snapshot_revision,
    projects.latest_snapshot_structure_revision,
    projects.updated_at,
    projects.created_at
  from public.shared_projects as projects
  where nullif(trim(projects.invite_token), '') = normalized_invite_token
  limit 1;
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
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_invite_token text := nullif(trim(target_invite_token), '');
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
    case when project_row.owner_user_id = current_user_id then 'owner' else 'editor' end,
    timezone('utc', now())
  )
  on conflict on constraint shared_project_members_pkey do update
  set
    project_id = excluded.project_id,
    role = excluded.role,
    last_opened_at = excluded.last_opened_at;

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

revoke all on function public.pixieed_can_access_shared_project(text) from public;
grant execute on function public.pixieed_can_access_shared_project(text) to authenticated;

revoke all on function public.pixieed_can_access_shared_project_id(uuid) from public;
grant execute on function public.pixieed_can_access_shared_project_id(uuid) to authenticated;

revoke all on function public.pixieed_get_shared_project(text) from public;
grant execute on function public.pixieed_get_shared_project(text) to authenticated;

revoke all on function public.pixieed_ensure_shared_project_membership(text, text, text, text, boolean) from public;
grant execute on function public.pixieed_ensure_shared_project_membership(text, text, text, text, boolean) to authenticated;

revoke all on function public.pixieed_get_shared_project_by_invite_token(text) from public;
grant execute on function public.pixieed_get_shared_project_by_invite_token(text) to authenticated;
grant execute on function public.pixieed_get_shared_project_by_invite_token(text) to anon;

revoke all on function public.pixieed_join_shared_project_by_invite_token(text) from public;
grant execute on function public.pixieed_join_shared_project_by_invite_token(text) to authenticated;

alter table public.shared_projects
  drop constraint if exists shared_projects_join_policy_check;

alter table public.shared_projects
  drop column if exists join_policy;
