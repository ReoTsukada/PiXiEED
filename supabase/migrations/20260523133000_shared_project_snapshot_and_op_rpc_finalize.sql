alter table public.shared_projects
  add column if not exists latest_snapshot_revision bigint not null default 0;
alter table public.shared_projects
  add column if not exists latest_snapshot_structure_revision bigint not null default 0;
alter table public.shared_projects
  add column if not exists latest_op_seq bigint not null default 0;
alter table public.shared_projects
  add column if not exists checkpoint_seq bigint not null default 0;
alter table public.shared_projects
  add column if not exists checkpoint_created_at timestamptz;

create or replace function public.pixieed_get_shared_project_ops_since(
  target_project_key text,
  after_revision bigint default 0,
  max_ops integer default 256
)
returns table (
  project_id uuid,
  project_key text,
  op_id text,
  seq bigint,
  revision bigint,
  base_revision bigint,
  base_structure_revision bigint,
  structure_revision bigint,
  op_type text,
  actor_user_id uuid,
  user_id uuid,
  client_id text,
  session_id text,
  kind text,
  canvas_id text,
  frame_index integer,
  layer_id text,
  payload jsonb,
  client_op_id text,
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
begin
  if current_user_id is null or normalized_key is null then
    return;
  end if;

  select *
  into project_row
  from public.shared_projects
  where project_key = normalized_key;

  if not found or not public.pixieed_can_access_shared_project(normalized_key) then
    return;
  end if;

  return query
  select
    ops.project_id,
    ops.project_key,
    coalesce(nullif(ops.op_id, ''), nullif(ops.client_op_id, ''), ops.id::text) as op_id,
    coalesce(ops.seq, ops.revision) as seq,
    ops.revision,
    coalesce(ops.base_revision, 0) as base_revision,
    coalesce(ops.base_structure_revision, 0) as base_structure_revision,
    coalesce(ops.structure_revision, 0) as structure_revision,
    coalesce(ops.op_type, 'draw') as op_type,
    ops.actor_user_id,
    ops.user_id,
    ops.client_id,
    ops.session_id,
    ops.kind,
    ops.canvas_id,
    ops.frame_index,
    ops.layer_id,
    coalesce(ops.payload, '{}'::jsonb) as payload,
    ops.client_op_id,
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

create or replace function public.pixieed_commit_shared_project_op(
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
  op_id text,
  committed_revision bigint,
  committed_structure_revision bigint,
  latest_revision bigint,
  latest_structure_revision bigint,
  latest_snapshot_revision bigint,
  latest_snapshot_structure_revision bigint,
  conflict_reason text,
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
    when op_type in ('draw', 'structure', 'palette', 'session', 'checkpoint', 'create', 'snapshot') then op_type
    else 'draw'
  end;
  normalized_history_label text := coalesce(history_label, '');
  requested_base_revision bigint := greatest(0, coalesce(base_revision, 0));
  requested_base_structure_revision bigint := greatest(0, coalesce(base_structure_revision, 0));
  provided_client_op_id text := nullif(trim(coalesce(op_payload->>'opId', op_payload->>'clientOpId', '')), '');
  provided_op_id text := nullif(trim(coalesce(op_payload->>'opId', op_payload->>'clientOpId', op_payload->>'operationId', '')), '');
  membership_role text := '';
  next_revision bigint := 0;
  next_structure_revision bigint := 0;
  frame_index_value integer := 0;
  project_row public.shared_projects%rowtype;
  existing_op public.shared_project_ops%rowtype;
begin
  if current_user_id is null or normalized_key is null or op_payload is null then
    return;
  end if;

  select *
  into project_row
  from public.shared_projects
  where project_key = normalized_key
  for update;

  if not found or not public.pixieed_can_access_shared_project(normalized_key) then
    return;
  end if;

  select coalesce(role, '')
  into membership_role
  from public.shared_project_members
  where project_id = project_row.id
    and user_id = current_user_id
  limit 1;

  if not (project_row.owner_user_id = current_user_id or membership_role in ('owner', 'editor')) then
    return query
    select
      'failed'::text,
      project_row.id,
      project_row.project_key,
      project_row.invite_token,
      project_row.visibility,
      project_row.owner_user_id,
      project_row.title,
      coalesce(provided_op_id, provided_client_op_id, ''),
      0::bigint,
      0::bigint,
      project_row.latest_revision,
      project_row.latest_structure_revision,
      project_row.latest_snapshot_revision,
      project_row.latest_snapshot_structure_revision,
      'not-editor'::text,
      project_row.updated_at,
      project_row.created_at,
      project_row.latest_revision,
      project_row.latest_structure_revision;
    return;
  end if;

  if provided_client_op_id is not null then
    select *
    into existing_op
    from public.shared_project_ops
    where project_id = project_row.id
      and client_op_id = provided_client_op_id
    limit 1;

    if found then
      return query
      select
        'duplicate'::text,
        project_row.id,
        project_row.project_key,
        project_row.invite_token,
        project_row.visibility,
        project_row.owner_user_id,
        project_row.title,
        coalesce(existing_op.op_id, provided_client_op_id),
        existing_op.revision,
        existing_op.structure_revision,
        project_row.latest_revision,
        project_row.latest_structure_revision,
        project_row.latest_snapshot_revision,
        project_row.latest_snapshot_structure_revision,
        ''::text,
        project_row.updated_at,
        project_row.created_at,
        project_row.latest_revision,
        project_row.latest_structure_revision;
      return;
    end if;
  end if;

  if normalized_op_type = 'draw' then
    if requested_base_structure_revision <> coalesce(project_row.latest_structure_revision, 0) then
      return query
      select
        'conflict'::text,
        project_row.id,
        project_row.project_key,
        project_row.invite_token,
        project_row.visibility,
        project_row.owner_user_id,
        project_row.title,
        coalesce(provided_op_id, provided_client_op_id, ''),
        0::bigint,
        0::bigint,
        project_row.latest_revision,
        project_row.latest_structure_revision,
        project_row.latest_snapshot_revision,
        project_row.latest_snapshot_structure_revision,
        'stale-structure-revision'::text,
        project_row.updated_at,
        project_row.created_at,
        project_row.latest_revision,
        project_row.latest_structure_revision;
      return;
    end if;
  elsif normalized_op_type = 'structure' then
    if requested_base_revision <> coalesce(project_row.latest_revision, 0)
      or requested_base_structure_revision <> coalesce(project_row.latest_structure_revision, 0) then
      return query
      select
        'conflict'::text,
        project_row.id,
        project_row.project_key,
        project_row.invite_token,
        project_row.visibility,
        project_row.owner_user_id,
        project_row.title,
        coalesce(provided_op_id, provided_client_op_id, ''),
        0::bigint,
        0::bigint,
        project_row.latest_revision,
        project_row.latest_structure_revision,
        project_row.latest_snapshot_revision,
        project_row.latest_snapshot_structure_revision,
        'stale-base-revision'::text,
        project_row.updated_at,
        project_row.created_at,
        project_row.latest_revision,
        project_row.latest_structure_revision;
      return;
    end if;
  end if;

  if coalesce(op_payload->>'frameIndex', '') ~ '^-?[0-9]+$' then
    frame_index_value := greatest(0, (op_payload->>'frameIndex')::integer);
  end if;

  next_revision := coalesce(project_row.latest_revision, 0) + 1;
  next_structure_revision := case
    when normalized_op_type = 'structure' then coalesce(project_row.latest_structure_revision, 0) + 1
    else coalesce(project_row.latest_structure_revision, 0)
  end;

  insert into public.shared_project_ops (
    project_id,
    project_key,
    op_id,
    client_op_id,
    seq,
    revision,
    base_revision,
    base_structure_revision,
    structure_revision,
    op_type,
    actor_user_id,
    user_id,
    client_id,
    session_id,
    kind,
    canvas_id,
    frame_index,
    layer_id,
    payload
  )
  values (
    project_row.id,
    project_row.project_key,
    coalesce(provided_op_id, provided_client_op_id, gen_random_uuid()::text),
    provided_client_op_id,
    next_revision,
    next_revision,
    requested_base_revision,
    requested_base_structure_revision,
    next_structure_revision,
    normalized_op_type,
    current_user_id,
    current_user_id,
    coalesce(op_payload->>'clientId', ''),
    coalesce(op_payload->>'sessionId', ''),
    coalesce(nullif(op_payload->>'kind', ''), normalized_op_type),
    coalesce(op_payload->>'canvasId', ''),
    frame_index_value,
    coalesce(op_payload->>'layerId', ''),
    jsonb_build_object(
      'historyLabel', normalized_history_label,
      'op', op_payload,
      'createdAt', coalesce(nullif(op_payload->>'createdAt', '')::timestamptz, timezone('utc', now()))
    )
  );

  update public.shared_projects
  set
    latest_op_seq = next_revision,
    latest_revision = next_revision,
    latest_structure_revision = next_structure_revision,
    updated_at = timezone('utc', now())
  where id = project_row.id
  returning *
  into project_row;

  return query
  select
    'committed'::text,
    project_row.id,
    project_row.project_key,
    project_row.invite_token,
    project_row.visibility,
    project_row.owner_user_id,
    project_row.title,
    coalesce(provided_op_id, provided_client_op_id, ''),
    next_revision,
    next_structure_revision,
    project_row.latest_revision,
    project_row.latest_structure_revision,
    project_row.latest_snapshot_revision,
    project_row.latest_snapshot_structure_revision,
    ''::text,
    project_row.updated_at,
    project_row.created_at,
    project_row.latest_revision,
    project_row.latest_structure_revision;
exception
  when unique_violation then
    select *
    into existing_op
    from public.shared_project_ops
    where project_id = project_row.id
      and client_op_id = provided_client_op_id
    limit 1;

    if found then
      return query
      select
        'duplicate'::text,
        project_row.id,
        project_row.project_key,
        project_row.invite_token,
        project_row.visibility,
        project_row.owner_user_id,
        project_row.title,
        coalesce(existing_op.op_id, provided_client_op_id, ''),
        coalesce(existing_op.revision, 0),
        coalesce(existing_op.structure_revision, 0),
        project_row.latest_revision,
        project_row.latest_structure_revision,
        project_row.latest_snapshot_revision,
        project_row.latest_snapshot_structure_revision,
        ''::text,
        project_row.updated_at,
        project_row.created_at,
        project_row.latest_revision,
        project_row.latest_structure_revision;
      return;
    end if;
end;
$$;

revoke all on function public.pixieed_commit_shared_project_op(text, bigint, bigint, text, text, jsonb) from public;
grant execute on function public.pixieed_commit_shared_project_op(text, bigint, bigint, text, text, jsonb) to authenticated;

create or replace function public.pixieed_commit_shared_project_snapshot(
  target_project_key text,
  next_title text default '',
  next_snapshot jsonb default '{}'::jsonb,
  base_revision bigint default 0,
  next_revision bigint default 0,
  base_structure_revision bigint default 0,
  next_structure_revision bigint default 0,
  op_type text default 'snapshot',
  history_label text default '',
  snapshot_reason text default '',
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
  latest_snapshot_at timestamptz,
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
  requested_base_revision bigint := greatest(0, coalesce(base_revision, 0));
  requested_next_revision bigint := greatest(0, coalesce(next_revision, 0));
  requested_base_structure_revision bigint := greatest(0, coalesce(base_structure_revision, 0));
  requested_next_structure_revision bigint := greatest(0, coalesce(next_structure_revision, 0));
  membership_role text := '';
  project_row public.shared_projects%rowtype;
begin
  if current_user_id is null or normalized_key is null or next_snapshot is null then
    return;
  end if;

  select *
  into project_row
  from public.shared_projects
  where project_key = normalized_key
  for update;

  if not found or not public.pixieed_can_access_shared_project(normalized_key) then
    return;
  end if;

  select coalesce(role, '')
  into membership_role
  from public.shared_project_members
  where project_id = project_row.id
    and user_id = current_user_id
  limit 1;

  if not (project_row.owner_user_id = current_user_id or membership_role in ('owner', 'editor')) then
    return;
  end if;

  if requested_base_revision <> coalesce(project_row.latest_revision, 0)
    or requested_base_structure_revision <> coalesce(project_row.latest_structure_revision, 0) then
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
      project_row.latest_snapshot_at,
      project_row.updated_at,
      project_row.created_at,
      project_row.latest_revision,
      project_row.latest_structure_revision;
    return;
  end if;

  update public.shared_projects
  set
    title = case
      when nullif(trim(normalized_title), '') is null then project_row.title
      else normalized_title
    end,
    latest_snapshot = next_snapshot,
    latest_snapshot_revision = requested_next_revision,
    latest_snapshot_structure_revision = requested_next_structure_revision,
    latest_snapshot_at = timezone('utc', now()),
    checkpoint_seq = requested_next_revision,
    checkpoint_created_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = project_row.id
  returning *
  into project_row;

  return query
  select
    'committed'::text,
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
    project_row.latest_snapshot_at,
    project_row.updated_at,
    project_row.created_at,
    project_row.latest_revision,
    project_row.latest_structure_revision;
end;
$$;

revoke all on function public.pixieed_commit_shared_project_snapshot(text, text, jsonb, bigint, bigint, bigint, bigint, text, text, text, jsonb) from public;
grant execute on function public.pixieed_commit_shared_project_snapshot(text, text, jsonb, bigint, bigint, bigint, bigint, text, text, text, jsonb) to authenticated;
