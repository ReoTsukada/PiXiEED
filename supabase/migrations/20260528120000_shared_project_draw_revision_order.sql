alter table public.shared_projects
  add column if not exists latest_revision bigint not null default 0;

alter table public.shared_projects
  add column if not exists latest_structure_revision bigint not null default 0;

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

alter table public.shared_project_ops
  add column if not exists op_id text;

alter table public.shared_project_ops
  add column if not exists seq bigint;

alter table public.shared_project_ops
  add column if not exists base_structure_revision bigint not null default 0;

update public.shared_project_ops
set
  seq = coalesce(seq, revision),
  op_id = coalesce(
    nullif(op_id, ''),
    nullif(payload->'op'->>'opId', ''),
    nullif(payload->'op'->>'clientOpId', ''),
    nullif(payload->>'opId', ''),
    nullif(payload->>'clientOpId', ''),
    'legacy-' || id::text
  )
where seq is null
   or op_id is null
   or op_id = '';

with duplicate_ops as (
  select
    id,
    project_id,
    op_id,
    row_number() over (
      partition by project_id, op_id
      order by coalesce(seq, revision), created_at, id
    ) as duplicate_rank
  from public.shared_project_ops
  where op_id is not null
    and op_id <> ''
)
update public.shared_project_ops as ops
set op_id = duplicate_ops.op_id || '#duplicate-' || duplicate_ops.duplicate_rank || '-' || left(ops.id::text, 8)
from duplicate_ops
where ops.id = duplicate_ops.id
  and duplicate_ops.duplicate_rank > 1;

create unique index if not exists shared_project_ops_project_revision_uidx
  on public.shared_project_ops (project_id, revision);

create unique index if not exists shared_project_ops_project_op_id_uidx
  on public.shared_project_ops (project_id, op_id);

create index if not exists shared_project_ops_project_revision_idx
  on public.shared_project_ops (project_id, revision asc);

do $$
begin
  begin
    alter publication supabase_realtime add table public.shared_project_ops;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end;
$$;

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
    when op_type in ('draw', 'structure', 'palette', 'session', 'checkpoint', 'create') then op_type
    else 'draw'
  end;
  normalized_history_label text := coalesce(history_label, '');
  requested_base_revision bigint := greatest(0, coalesce(base_revision, 0));
  requested_base_structure_revision bigint := greatest(0, coalesce(base_structure_revision, 0));
  provided_op_id text := nullif(trim(coalesce(op_payload->>'opId', op_payload->>'clientOpId', '')), '');
  membership_role text := '';
  next_revision bigint;
  next_structure_revision bigint;
  frame_index_value integer := 0;
  project_row public.shared_projects%rowtype;
  existing_op public.shared_project_ops%rowtype;
begin
  if current_user_id is null or normalized_key is null or op_payload is null or provided_op_id is null then
    return query select
      'failed'::text, null::uuid, normalized_key, ''::text, ''::text, null::uuid, ''::text, ''::text,
      0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 'missing-op-id'::text,
      timezone('utc', now()), timezone('utc', now()), 0::bigint, 0::bigint;
    return;
  end if;

  select *
  into project_row
  from public.shared_projects
  where shared_projects.project_key = normalized_key
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

  if not (
    project_row.owner_user_id = current_user_id
    or membership_role in ('owner', 'editor')
  ) then
    return query
    select
      'failed'::text,
      project_row.id,
      project_row.project_key,
      project_row.invite_token,
      project_row.visibility,
      project_row.owner_user_id,
      project_row.title,
      provided_op_id,
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

  select *
  into existing_op
  from public.shared_project_ops
  where shared_project_ops.project_id = project_row.id
    and shared_project_ops.op_id = provided_op_id
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
      existing_op.op_id,
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

  if normalized_op_type in ('draw', 'palette') then
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
        provided_op_id,
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
  elsif requested_base_revision <> coalesce(project_row.latest_revision, 0)
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
      provided_op_id,
      0::bigint,
      0::bigint,
      project_row.latest_revision,
      project_row.latest_structure_revision,
      project_row.latest_snapshot_revision,
      project_row.latest_snapshot_structure_revision,
      case
        when requested_base_revision <> coalesce(project_row.latest_revision, 0) then 'stale-base-revision'
        else 'stale-structure-revision'
      end::text,
      project_row.updated_at,
      project_row.created_at,
      project_row.latest_revision,
      project_row.latest_structure_revision;
    return;
  end if;

  if coalesce(op_payload->>'frameIndex', '') ~ '^-?[0-9]+$' then
    frame_index_value := greatest(0, (op_payload->>'frameIndex')::integer);
  end if;

  next_revision := coalesce(project_row.latest_revision, 0) + 1;
  if normalized_op_type in ('structure', 'create') then
    next_structure_revision := coalesce(project_row.latest_structure_revision, 0) + 1;
  else
    next_structure_revision := coalesce(project_row.latest_structure_revision, 0);
  end if;

  insert into public.shared_project_ops (
    project_id,
    project_key,
    op_id,
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
    provided_op_id,
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
    coalesce(nullif(op_payload->>'kind', ''), case when normalized_op_type = 'palette' then 'palette-update' else normalized_op_type end),
    coalesce(op_payload->>'canvasId', ''),
    frame_index_value,
    coalesce(op_payload->>'layerId', ''),
    jsonb_build_object(
      'historyLabel', normalized_history_label,
      'op', op_payload || jsonb_build_object('opId', provided_op_id),
      'createdAt', timezone('utc', now())
    )
  );

  update public.shared_projects
  set
    latest_op_seq = next_revision,
    latest_revision = next_revision,
    latest_structure_revision = next_structure_revision,
    updated_at = timezone('utc', now())
  where shared_projects.id = project_row.id
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
    provided_op_id,
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
    where shared_project_ops.project_id = project_row.id
      and shared_project_ops.op_id = provided_op_id
    limit 1;

    return query
    select
      'duplicate'::text,
      project_row.id,
      project_row.project_key,
      project_row.invite_token,
      project_row.visibility,
      project_row.owner_user_id,
      project_row.title,
      provided_op_id,
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
  normalized_reason text := nullif(trim(snapshot_reason), '');
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
  where shared_projects.project_key = normalized_key
  for update;

  if not found or not public.pixieed_can_access_shared_project(normalized_key) then
    return query
    select
      'rejected'::text,
      null::uuid,
      normalized_key,
      ''::text,
      ''::text,
      null::uuid,
      ''::text,
      '{}'::jsonb,
      0::bigint,
      0::bigint,
      0::bigint,
      0::bigint,
      null::timestamptz,
      null::timestamptz,
      null::timestamptz,
      0::bigint,
      0::bigint;
    return;
  end if;

  select coalesce(role, '')
  into membership_role
  from public.shared_project_members
  where project_id = project_row.id
    and user_id = current_user_id
  limit 1;

  if not (
    project_row.owner_user_id = current_user_id
    or membership_role in ('owner', 'editor')
  ) then
    return query
    select
      'rejected'::text,
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

  if normalized_reason is null or normalized_reason not in (
    'scheduled-checkpoint',
    'manual-checkpoint',
    'structure-checkpoint',
    'recovery-verified-checkpoint',
    'checkpoint',
    'sharedRemoteDrawCheckpoint',
    'sharedForceResync',
    'sharedConflictReplay',
    'sharedProjectCreate',
    'sharedFinalSnapshot',
    'sharedFinalSnapshotPageHide'
  ) then
    return query
    select
      'rejected'::text,
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

  if requested_base_revision <> project_row.latest_revision or requested_next_revision <> project_row.latest_revision then
    return query
    select
      'rejected'::text,
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

  requested_next_structure_revision := least(
    greatest(requested_next_structure_revision, requested_base_structure_revision),
    greatest(project_row.latest_structure_revision, requested_base_structure_revision)
  );

  update public.shared_projects
  set
    title = case
      when nullif(trim(normalized_title), '') is null then project_row.title
      else normalized_title
    end,
    latest_snapshot = next_snapshot,
    latest_snapshot_revision = project_row.latest_revision,
    latest_snapshot_structure_revision = requested_next_structure_revision,
    checkpoint_seq = project_row.latest_revision,
    checkpoint_created_at = timezone('utc', now()),
    latest_snapshot_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where shared_projects.id = project_row.id
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
