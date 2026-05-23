alter table public.shared_projects
  add column if not exists latest_revision bigint;
alter table public.shared_projects
  add column if not exists latest_structure_revision bigint;
alter table public.shared_projects
  add column if not exists latest_snapshot_revision bigint;
alter table public.shared_projects
  add column if not exists latest_snapshot_structure_revision bigint;
alter table public.shared_projects
  add column if not exists latest_op_seq bigint;
alter table public.shared_projects
  add column if not exists checkpoint_seq bigint;
alter table public.shared_projects
  add column if not exists checkpoint_created_at timestamptz;

update public.shared_projects
set
  latest_revision = coalesce(latest_revision, 0),
  latest_structure_revision = coalesce(latest_structure_revision, 0),
  latest_snapshot_revision = coalesce(latest_snapshot_revision, 0),
  latest_snapshot_structure_revision = coalesce(latest_snapshot_structure_revision, 0),
  latest_op_seq = coalesce(latest_op_seq, 0),
  checkpoint_seq = coalesce(checkpoint_seq, 0)
where
  latest_revision is null
  or latest_structure_revision is null
  or latest_snapshot_revision is null
  or latest_snapshot_structure_revision is null
  or latest_op_seq is null
  or checkpoint_seq is null;

alter table public.shared_projects
  alter column latest_revision set default 0;
alter table public.shared_projects
  alter column latest_structure_revision set default 0;
alter table public.shared_projects
  alter column latest_snapshot_revision set default 0;
alter table public.shared_projects
  alter column latest_snapshot_structure_revision set default 0;
alter table public.shared_projects
  alter column latest_op_seq set default 0;
alter table public.shared_projects
  alter column checkpoint_seq set default 0;

alter table public.shared_projects
  alter column latest_revision set not null;
alter table public.shared_projects
  alter column latest_structure_revision set not null;
alter table public.shared_projects
  alter column latest_snapshot_revision set not null;
alter table public.shared_projects
  alter column latest_snapshot_structure_revision set not null;
alter table public.shared_projects
  alter column latest_op_seq set not null;
alter table public.shared_projects
  alter column checkpoint_seq set not null;

alter table public.shared_project_ops
  add column if not exists project_id uuid;
alter table public.shared_project_ops
  add column if not exists revision bigint;
alter table public.shared_project_ops
  add column if not exists base_revision bigint;
alter table public.shared_project_ops
  add column if not exists structure_revision bigint;
alter table public.shared_project_ops
  add column if not exists op_type text;
alter table public.shared_project_ops
  add column if not exists actor_user_id uuid;
alter table public.shared_project_ops
  add column if not exists payload jsonb;
alter table public.shared_project_ops
  add column if not exists client_op_id text;
alter table public.shared_project_ops
  add column if not exists created_at timestamptz;

update public.shared_project_ops as ops
set
  revision = coalesce(ops.revision, ops.seq, 0),
  base_revision = coalesce(ops.base_revision, 0),
  structure_revision = coalesce(ops.structure_revision, 0),
  op_type = coalesce(nullif(ops.op_type, ''), 'draw'),
  actor_user_id = coalesce(ops.actor_user_id, ops.user_id),
  payload = coalesce(ops.payload, '{}'::jsonb),
  client_op_id = coalesce(
    nullif(ops.client_op_id, ''),
    nullif(ops.op_id, ''),
    nullif(ops.payload->'op'->>'opId', ''),
    nullif(ops.payload->'op'->>'clientOpId', ''),
    nullif(ops.payload->>'opId', ''),
    nullif(ops.payload->>'clientOpId', '')
  ),
  created_at = coalesce(ops.created_at, timezone('utc', now()))
where
  ops.revision is null
  or ops.base_revision is null
  or ops.structure_revision is null
  or ops.op_type is null
  or ops.payload is null
  or ops.created_at is null
  or ops.actor_user_id is null
  or ops.client_op_id is null;

alter table public.shared_project_ops
  alter column base_revision set default 0;
alter table public.shared_project_ops
  alter column structure_revision set default 0;
alter table public.shared_project_ops
  alter column payload set default '{}'::jsonb;
alter table public.shared_project_ops
  alter column created_at set default timezone('utc', now());

alter table public.shared_project_ops
  alter column project_id set not null;
alter table public.shared_project_ops
  alter column revision set not null;
alter table public.shared_project_ops
  alter column base_revision set not null;
alter table public.shared_project_ops
  alter column structure_revision set not null;
alter table public.shared_project_ops
  alter column op_type set not null;
alter table public.shared_project_ops
  alter column actor_user_id set not null;
alter table public.shared_project_ops
  alter column payload set not null;
alter table public.shared_project_ops
  alter column created_at set not null;

create unique index if not exists shared_project_ops_project_revision_uidx
  on public.shared_project_ops(project_id, revision);

create unique index if not exists shared_project_ops_project_client_op_uidx
  on public.shared_project_ops(project_id, client_op_id)
  where client_op_id is not null;

create index if not exists shared_project_ops_project_revision_idx
  on public.shared_project_ops(project_id, revision);

create index if not exists shared_project_ops_project_created_at_idx
  on public.shared_project_ops(project_id, created_at);

do $$
begin
  begin
    alter publication supabase_realtime add table public.shared_project_ops;
  exception
    when duplicate_object then null;
  end;
exception
  when undefined_object then null;
end
$$;

create or replace function public.pixieed_get_shared_project_ops_since(
  target_project_key text,
  after_revision bigint default 0,
  max_ops integer default 256
)
returns table (
  id uuid,
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
    ops.id,
    ops.project_id,
    ops.project_key,
    coalesce(ops.op_id, ops.client_op_id, ops.id::text) as op_id,
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
  latest_snapshot jsonb,
  latest_revision bigint,
  latest_structure_revision bigint,
  latest_snapshot_revision bigint,
  latest_snapshot_structure_revision bigint,
  latest_op_seq bigint,
  checkpoint_seq bigint,
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
    when op_type in ('draw', 'structure', 'palette', 'session', 'create', 'snapshot') then op_type
    else 'draw'
  end;
  requested_base_revision bigint := greatest(0, coalesce(base_revision, 0));
  requested_base_structure_revision bigint := greatest(0, coalesce(base_structure_revision, 0));
  resolved_client_op_id text := nullif(trim(coalesce(op_payload->>'opId', op_payload->>'clientOpId', '')), '');
  resolved_op_id text := nullif(trim(coalesce(op_payload->>'opId', op_payload->>'clientOpId', op_payload->>'operationId', '')), '');
  membership_role text := '';
  next_revision bigint := 0;
  next_structure_revision bigint := 0;
  frame_index_value integer := 0;
  payload_created_at timestamptz := timezone('utc', now());
  project_row public.shared_projects%rowtype;
  existing_op public.shared_project_ops%rowtype;
begin
  if current_user_id is null or normalized_key is null then
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

  if resolved_client_op_id is not null then
    select *
    into existing_op
    from public.shared_project_ops
    where project_id = project_row.id
      and client_op_id = resolved_client_op_id
    limit 1;
    if found then
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
        project_row.latest_op_seq,
        project_row.checkpoint_seq,
        project_row.updated_at,
        project_row.created_at,
        coalesce(existing_op.revision, project_row.latest_revision),
        coalesce(existing_op.structure_revision, project_row.latest_structure_revision);
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
        project_row.latest_snapshot,
        project_row.latest_revision,
        project_row.latest_structure_revision,
        project_row.latest_snapshot_revision,
        project_row.latest_snapshot_structure_revision,
        project_row.latest_op_seq,
        project_row.checkpoint_seq,
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
        project_row.latest_snapshot,
        project_row.latest_revision,
        project_row.latest_structure_revision,
        project_row.latest_snapshot_revision,
        project_row.latest_snapshot_structure_revision,
        project_row.latest_op_seq,
        project_row.checkpoint_seq,
        project_row.updated_at,
        project_row.created_at,
        project_row.latest_revision,
        project_row.latest_structure_revision;
      return;
    end if;
  elsif normalized_op_type in ('create', 'snapshot') then
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
        project_row.latest_op_seq,
        project_row.checkpoint_seq,
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
  if coalesce(op_payload->>'createdAt', '') <> '' then
    begin
      payload_created_at := (op_payload->>'createdAt')::timestamptz;
    exception
      when others then payload_created_at := timezone('utc', now());
    end;
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
    payload,
    created_at
  )
  values (
    project_row.id,
    project_row.project_key,
    coalesce(resolved_op_id, resolved_client_op_id, gen_random_uuid()::text),
    resolved_client_op_id,
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
      'historyLabel', coalesce(history_label, ''),
      'op', coalesce(op_payload, '{}'::jsonb),
      'createdAt', payload_created_at
    ),
    timezone('utc', now())
  );

  update public.shared_projects
  set
    latest_revision = next_revision,
    latest_structure_revision = next_structure_revision,
    latest_op_seq = next_revision,
    updated_at = timezone('utc', now())
  where id = project_row.id
  returning *
  into project_row;

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
    project_row.latest_op_seq,
    project_row.checkpoint_seq,
    project_row.updated_at,
    project_row.created_at,
    project_row.latest_revision,
    project_row.latest_structure_revision;
exception
  when unique_violation then
    if resolved_client_op_id is not null then
      select *
      into existing_op
      from public.shared_project_ops
      where project_id = project_row.id
        and client_op_id = resolved_client_op_id
      limit 1;
      if found then
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
          project_row.latest_op_seq,
          project_row.checkpoint_seq,
          project_row.updated_at,
          project_row.created_at,
          coalesce(existing_op.revision, project_row.latest_revision),
          coalesce(existing_op.structure_revision, project_row.latest_structure_revision);
        return;
      end if;
    end if;
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
      project_row.latest_op_seq,
      project_row.checkpoint_seq,
      project_row.updated_at,
      project_row.created_at,
      project_row.latest_revision,
      project_row.latest_structure_revision;
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
  normalized_type text := case
    when op_type in ('snapshot', 'structure', 'create', 'draw') then op_type
    else 'snapshot'
  end;
  requested_base_revision bigint := greatest(0, coalesce(base_revision, 0));
  requested_base_structure_revision bigint := greatest(0, coalesce(base_structure_revision, 0));
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

  if normalized_type in ('snapshot', 'structure', 'create') then
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
  end if;

  update public.shared_projects
  set
    title = case
      when nullif(trim(normalized_title), '') is null then project_row.title
      else normalized_title
    end,
    latest_snapshot = next_snapshot,
    latest_snapshot_revision = coalesce(project_row.latest_revision, 0),
    latest_snapshot_structure_revision = coalesce(project_row.latest_structure_revision, 0),
    latest_snapshot_at = timezone('utc', now()),
    checkpoint_seq = coalesce(project_row.latest_revision, 0),
    checkpoint_created_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = project_row.id
  returning *
  into project_row;

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
    project_row.latest_snapshot_at,
    project_row.updated_at,
    project_row.created_at,
    project_row.latest_revision,
    project_row.latest_structure_revision;
end;
$$;

revoke all on function public.pixieed_commit_shared_project_snapshot(text, text, jsonb, bigint, bigint, bigint, bigint, text, text, text, jsonb) from public;
grant execute on function public.pixieed_commit_shared_project_snapshot(text, text, jsonb, bigint, bigint, bigint, bigint, text, text, text, jsonb) to authenticated;
