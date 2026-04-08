alter table public.shared_projects
  add column if not exists latest_op_seq bigint not null default 0;

alter table public.shared_projects
  add column if not exists checkpoint_seq bigint not null default 0;

alter table public.shared_projects
  add column if not exists checkpoint_created_at timestamptz;

update public.shared_projects
set
  latest_op_seq = greatest(coalesce(latest_op_seq, 0), coalesce(latest_revision, 0)),
  checkpoint_seq = greatest(coalesce(checkpoint_seq, 0), coalesce(latest_snapshot_revision, 0)),
  checkpoint_created_at = coalesce(checkpoint_created_at, updated_at, timezone('utc', now()));

alter table public.shared_project_ops
  add column if not exists seq bigint;

alter table public.shared_project_ops
  add column if not exists client_id text not null default '';

alter table public.shared_project_ops
  add column if not exists session_id text not null default '';

alter table public.shared_project_ops
  add column if not exists kind text not null default 'layer-patch';

alter table public.shared_project_ops
  add column if not exists canvas_id text not null default '';

alter table public.shared_project_ops
  add column if not exists frame_index integer not null default 0;

alter table public.shared_project_ops
  add column if not exists layer_id text not null default '';

update public.shared_project_ops
set
  seq = coalesce(seq, revision),
  client_id = coalesce(nullif(payload->'op'->>'clientId', ''), ''),
  session_id = coalesce(nullif(payload->'op'->>'sessionId', ''), ''),
  kind = coalesce(nullif(payload->'op'->>'kind', ''), op_type, 'layer-patch'),
  canvas_id = coalesce(nullif(payload->'op'->>'canvasId', ''), ''),
  frame_index = greatest(0, coalesce((payload->'op'->>'frameIndex')::integer, 0)),
  layer_id = coalesce(nullif(payload->'op'->>'layerId', ''), '')
where seq is null
   or client_id = ''
   or session_id = ''
   or kind = ''
   or canvas_id = ''
   or layer_id = '';

alter table public.shared_project_ops
  alter column seq set not null;

create unique index if not exists shared_project_ops_project_seq_uidx
  on public.shared_project_ops (project_id, seq);

create index if not exists shared_project_ops_project_seq_idx
  on public.shared_project_ops (project_id, seq asc);

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
  next_seq bigint;
  next_structure_revision bigint;
  project_row public.shared_projects%rowtype;
  membership_exists boolean := false;
  op_kind text := coalesce(nullif(op_payload->>'kind', ''), normalized_op_type, 'layer-patch');
  op_client_id text := coalesce(nullif(op_payload->>'clientId', ''), '');
  op_session_id text := coalesce(nullif(op_payload->>'sessionId', ''), '');
  op_canvas_id text := coalesce(nullif(op_payload->>'canvasId', ''), '');
  op_frame_index integer := greatest(0, coalesce((op_payload->>'frameIndex')::integer, 0));
  op_layer_id text := coalesce(nullif(op_payload->>'layerId', ''), '');
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

  next_seq := greatest(coalesce(project_row.latest_op_seq, 0), coalesce(project_row.latest_revision, 0)) + 1;
  if normalized_op_type = 'structure' then
    next_structure_revision := project_row.latest_structure_revision + 1;
  else
    next_structure_revision := project_row.latest_structure_revision;
  end if;

  update public.shared_projects
  set
    latest_op_seq = next_seq,
    latest_revision = next_seq,
    latest_structure_revision = next_structure_revision,
    updated_at = timezone('utc', now())
  where shared_projects.id = project_row.id
  returning *
  into project_row;

  insert into public.shared_project_ops (
    project_id,
    seq,
    revision,
    base_revision,
    structure_revision,
    op_type,
    actor_user_id,
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
    next_seq,
    next_seq,
    requested_base_revision,
    project_row.latest_structure_revision,
    normalized_op_type,
    current_user_id,
    op_client_id,
    op_session_id,
    op_kind,
    op_canvas_id,
    op_frame_index,
    op_layer_id,
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
  seq bigint,
  revision bigint,
  base_revision bigint,
  structure_revision bigint,
  op_type text,
  actor_user_id uuid,
  client_id text,
  session_id text,
  kind text,
  canvas_id text,
  frame_index integer,
  layer_id text,
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
    ops.seq,
    ops.revision,
    ops.base_revision,
    ops.structure_revision,
    ops.op_type,
    ops.actor_user_id,
    ops.client_id,
    ops.session_id,
    ops.kind,
    ops.canvas_id,
    ops.frame_index,
    ops.layer_id,
    ops.payload,
    ops.created_at
  from public.shared_project_ops as ops
  where ops.project_id = project_row.id
    and coalesce(ops.seq, ops.revision) > normalized_after_revision
  order by coalesce(ops.seq, ops.revision) asc
  limit normalized_limit;
end;
$$;

revoke all on function public.pixieed_get_shared_project_ops_since(text, bigint, integer) from public;
grant execute on function public.pixieed_get_shared_project_ops_since(text, bigint, integer) to authenticated;

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
    latest_op_seq = greatest(coalesce(project_row.latest_op_seq, 0), requested_next_revision),
    checkpoint_seq = requested_next_revision,
    checkpoint_created_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where shared_projects.id = project_row.id
  returning *
  into project_row;

  insert into public.shared_project_ops (
    project_id,
    seq,
    revision,
    base_revision,
    structure_revision,
    op_type,
    actor_user_id,
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
    project_row.latest_revision,
    project_row.latest_revision,
    requested_base_revision,
    project_row.latest_structure_revision,
    normalized_op_type,
    current_user_id,
    coalesce(nullif(op_payload->>'clientId', ''), ''),
    coalesce(nullif(op_payload->>'sessionId', ''), ''),
    coalesce(nullif(op_payload->>'kind', ''), normalized_op_type, 'checkpoint'),
    coalesce(nullif(op_payload->>'canvasId', ''), ''),
    greatest(0, coalesce((op_payload->>'frameIndex')::integer, 0)),
    coalesce(nullif(op_payload->>'layerId', ''), ''),
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
