alter table public.shared_projects
  add column if not exists latest_snapshot_revision bigint not null default 0;

alter table public.shared_projects
  add column if not exists latest_snapshot_structure_revision bigint not null default 0;

update public.shared_projects
set
  latest_snapshot_revision = greatest(coalesce(latest_snapshot_revision, 0), coalesce(latest_revision, 0)),
  latest_snapshot_structure_revision = greatest(coalesce(latest_snapshot_structure_revision, 0), coalesce(latest_structure_revision, 0))
where latest_snapshot is not null
  and (
    coalesce(latest_snapshot_revision, 0) = 0
    or coalesce(latest_snapshot_structure_revision, 0) = 0
  );

drop function if exists public.pixieed_commit_shared_project_snapshot(text, text, jsonb, bigint, bigint, bigint, bigint, text, text, jsonb);

create function public.pixieed_commit_shared_project_snapshot(
  target_project_key text,
  next_title text default '',
  next_snapshot jsonb default '{}'::jsonb,
  base_revision bigint default 0,
  next_revision bigint default 0,
  base_structure_revision bigint default 0,
  next_structure_revision bigint default 0,
  op_type text default 'snapshot',
  history_label text default '',
  op_payload jsonb default '{}'::jsonb
)
returns table (
  commit_status text,
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
  conflict_revision bigint,
  conflict_structure_revision bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_key text := nullif(trim(target_project_key), '');
  normalized_title text := coalesce(next_title, '');
  normalized_op_type text := case
    when op_type in ('draw', 'structure', 'snapshot', 'create', 'palette', 'session', 'checkpoint') then op_type
    else 'snapshot'
  end;
  normalized_history_label text := coalesce(history_label, '');
  requested_base_revision bigint := greatest(0, coalesce(base_revision, 0));
  requested_next_revision bigint := greatest(0, coalesce(next_revision, 0));
  requested_base_structure_revision bigint := greatest(0, coalesce(base_structure_revision, 0));
  requested_next_structure_revision bigint := greatest(0, coalesce(next_structure_revision, 0));
  project_row public.shared_projects%rowtype;
  membership_exists boolean := false;
begin
  if current_user_id is null or normalized_key is null or next_snapshot is null then
    return;
  end if;

  select *
  into project_row
  from public.shared_projects
  where shared_projects.project_key = normalized_key
  for update;

  if not found then
    return;
  end if;

  select exists (
    select 1
    from public.shared_project_members members
    where members.project_key = project_row.project_key
      and members.user_id = current_user_id
  )
  into membership_exists;

  if not membership_exists and project_row.owner_user_id <> current_user_id then
    return;
  end if;

  if project_row.latest_revision <> requested_base_revision
    or project_row.latest_structure_revision <> requested_base_structure_revision then
    return query
    select
      'conflict'::text,
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
      project_row.latest_revision,
      project_row.latest_structure_revision;
    return;
  end if;

  if requested_next_revision <= requested_base_revision then
    requested_next_revision := requested_base_revision + 1;
  end if;

  if normalized_op_type = 'structure' then
    if requested_next_structure_revision <= requested_base_structure_revision then
      requested_next_structure_revision := requested_base_structure_revision + 1;
    end if;
  else
    requested_next_structure_revision := requested_base_structure_revision;
  end if;

  update public.shared_projects
  set
    title = case
      when nullif(trim(normalized_title), '') is null then project_row.title
      else normalized_title
    end,
    latest_snapshot = next_snapshot,
    latest_revision = requested_next_revision,
    latest_structure_revision = requested_next_structure_revision,
    latest_snapshot_revision = requested_next_revision,
    latest_snapshot_structure_revision = requested_next_structure_revision,
    updated_at = timezone('utc', now())
  where shared_projects.id = project_row.id
  returning *
  into project_row;

  insert into public.shared_project_ops (
    project_id,
    revision,
    base_revision,
    structure_revision,
    op_type,
    actor_user_id,
    payload
  )
  values (
    project_row.id,
    project_row.latest_revision,
    requested_base_revision,
    project_row.latest_structure_revision,
    normalized_op_type,
    current_user_id,
    jsonb_build_object(
      'historyLabel', normalized_history_label,
      'op', coalesce(op_payload, '{}'::jsonb),
      'createdAt', timezone('utc', now())
    )
  );

  return query
  select
    'ok'::text,
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
    project_row.latest_revision,
    project_row.latest_structure_revision;
end;
$$;

revoke all on function public.pixieed_commit_shared_project_snapshot(text, text, jsonb, bigint, bigint, bigint, bigint, text, text, jsonb) from public;
grant execute on function public.pixieed_commit_shared_project_snapshot(text, text, jsonb, bigint, bigint, bigint, bigint, text, text, jsonb) to authenticated;

drop function if exists public.pixieed_commit_shared_project_op(text, bigint, bigint, text, text, jsonb);

create function public.pixieed_commit_shared_project_op(
  target_project_key text,
  base_revision bigint default 0,
  base_structure_revision bigint default 0,
  op_type text default 'draw',
  history_label text default '',
  op_payload jsonb default '{}'::jsonb
)
returns table (
  commit_status text,
  id uuid,
  project_key text,
  invite_token text,
  visibility text,
  owner_user_id uuid,
  title text,
  latest_revision bigint,
  latest_structure_revision bigint,
  latest_snapshot_revision bigint,
  latest_snapshot_structure_revision bigint,
  updated_at timestamptz,
  created_at timestamptz,
  conflict_revision bigint,
  conflict_structure_revision bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_key text := nullif(trim(target_project_key), '');
  normalized_op_type text := case
    when op_type in ('draw', 'structure', 'palette', 'session', 'checkpoint', 'create') then op_type
    else 'draw'
  end;
  normalized_history_label text := coalesce(history_label, '');
  requested_base_revision bigint := greatest(0, coalesce(base_revision, 0));
  requested_base_structure_revision bigint := greatest(0, coalesce(base_structure_revision, 0));
  next_revision bigint;
  next_structure_revision bigint;
  project_row public.shared_projects%rowtype;
  membership_exists boolean := false;
begin
  if current_user_id is null or normalized_key is null or op_payload is null then
    return;
  end if;

  select *
  into project_row
  from public.shared_projects
  where shared_projects.project_key = normalized_key
  for update;

  if not found then
    return;
  end if;

  select exists (
    select 1
    from public.shared_project_members members
    where members.project_key = project_row.project_key
      and members.user_id = current_user_id
  )
  into membership_exists;

  if not membership_exists and project_row.owner_user_id <> current_user_id then
    return;
  end if;

  if project_row.latest_revision <> requested_base_revision
    or project_row.latest_structure_revision <> requested_base_structure_revision then
    return query
    select
      'conflict'::text,
      project_row.id,
      project_row.project_key,
      project_row.invite_token,
      project_row.visibility,
      project_row.owner_user_id,
      project_row.title,
      project_row.latest_revision,
      project_row.latest_structure_revision,
      project_row.latest_snapshot_revision,
      project_row.latest_snapshot_structure_revision,
      project_row.updated_at,
      project_row.created_at,
      project_row.latest_revision,
      project_row.latest_structure_revision;
    return;
  end if;

  next_revision := project_row.latest_revision + 1;
  if normalized_op_type = 'structure' then
    next_structure_revision := project_row.latest_structure_revision + 1;
  else
    next_structure_revision := project_row.latest_structure_revision;
  end if;

  update public.shared_projects
  set
    latest_revision = next_revision,
    latest_structure_revision = next_structure_revision,
    updated_at = timezone('utc', now())
  where shared_projects.id = project_row.id
  returning *
  into project_row;

  insert into public.shared_project_ops (
    project_id,
    revision,
    base_revision,
    structure_revision,
    op_type,
    actor_user_id,
    payload
  )
  values (
    project_row.id,
    project_row.latest_revision,
    requested_base_revision,
    project_row.latest_structure_revision,
    normalized_op_type,
    current_user_id,
    jsonb_build_object(
      'historyLabel', normalized_history_label,
      'op', coalesce(op_payload, '{}'::jsonb),
      'createdAt', timezone('utc', now())
    )
  );

  return query
  select
    'ok'::text,
    project_row.id,
    project_row.project_key,
    project_row.invite_token,
    project_row.visibility,
    project_row.owner_user_id,
    project_row.title,
    project_row.latest_revision,
    project_row.latest_structure_revision,
    project_row.latest_snapshot_revision,
    project_row.latest_snapshot_structure_revision,
    project_row.updated_at,
    project_row.created_at,
    project_row.latest_revision,
    project_row.latest_structure_revision;
end;
$$;

revoke all on function public.pixieed_commit_shared_project_op(text, bigint, bigint, text, text, jsonb) from public;
grant execute on function public.pixieed_commit_shared_project_op(text, bigint, bigint, text, text, jsonb) to authenticated;

drop function if exists public.pixieed_get_shared_project_ops_since(text, bigint, integer);

create function public.pixieed_get_shared_project_ops_since(
  target_project_key text,
  after_revision bigint default 0,
  max_ops integer default 256
)
returns table (
  project_id uuid,
  project_key text,
  revision bigint,
  base_revision bigint,
  structure_revision bigint,
  op_type text,
  actor_user_id uuid,
  payload jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_key text := nullif(trim(target_project_key), '');
  normalized_after_revision bigint := greatest(0, coalesce(after_revision, 0));
  normalized_limit integer := greatest(1, least(coalesce(max_ops, 256), 1000));
  project_row public.shared_projects%rowtype;
  membership_exists boolean := false;
begin
  if current_user_id is null or normalized_key is null then
    return;
  end if;

  select *
  into project_row
  from public.shared_projects
  where shared_projects.project_key = normalized_key;

  if not found then
    return;
  end if;

  select exists (
    select 1
    from public.shared_project_members members
    where members.project_key = project_row.project_key
      and members.user_id = current_user_id
  )
  into membership_exists;

  if not membership_exists and project_row.owner_user_id <> current_user_id then
    return;
  end if;

  return query
  select
    ops.project_id,
    project_row.project_key,
    ops.revision,
    ops.base_revision,
    ops.structure_revision,
    ops.op_type,
    ops.actor_user_id,
    ops.payload,
    ops.created_at
  from public.shared_project_ops as ops
  where ops.project_id = project_row.id
    and ops.revision > normalized_after_revision
  order by ops.revision asc
  limit normalized_limit;
end;
$$;

revoke all on function public.pixieed_get_shared_project_ops_since(text, bigint, integer) from public;
grant execute on function public.pixieed_get_shared_project_ops_since(text, bigint, integer) to authenticated;
