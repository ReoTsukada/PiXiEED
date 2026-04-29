alter table public.shared_projects
  add column if not exists latest_snapshot_at timestamptz;

alter table public.shared_project_ops
  add column if not exists project_key text;

alter table public.shared_project_ops
  add column if not exists op_id text;

alter table public.shared_project_ops
  add column if not exists base_structure_revision bigint not null default 0;

alter table public.shared_project_ops
  add column if not exists user_id uuid;

update public.shared_projects
set latest_snapshot_at = coalesce(latest_snapshot_at, updated_at, timezone('utc', now()))
where latest_snapshot is not null
  and latest_snapshot_at is null;

update public.shared_project_ops as ops
set
  project_key = coalesce(ops.project_key, projects.project_key),
  op_id = coalesce(
    nullif(ops.op_id, ''),
    nullif(ops.payload->'op'->>'opId', ''),
    'legacy-' || coalesce(ops.id::text, gen_random_uuid()::text)
  ),
  base_structure_revision = greatest(
    coalesce(ops.base_structure_revision, 0),
    coalesce((ops.payload->'op'->>'baseStructureRevision')::bigint, 0)
  ),
  user_id = coalesce(ops.user_id, ops.actor_user_id)
from public.shared_projects as projects
where projects.id = ops.project_id
  and (
    ops.project_key is null
    or ops.op_id is null
    or ops.op_id = ''
    or ops.user_id is null
    or ops.base_structure_revision = 0
  );

alter table public.shared_project_ops
  alter column project_key set not null;

alter table public.shared_project_ops
  alter column op_id set not null;

alter table public.shared_project_ops
  alter column user_id set not null;

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

create unique index if not exists shared_project_ops_project_op_id_uidx
  on public.shared_project_ops (project_id, op_id);

create index if not exists shared_project_ops_project_revision_idx
  on public.shared_project_ops (project_id, revision asc);

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

revoke all on function public.pixieed_get_shared_project(text) from public;
grant execute on function public.pixieed_get_shared_project(text) to authenticated;

drop function if exists public.pixieed_get_shared_project_ops_since(text, bigint, integer);
create function public.pixieed_get_shared_project_ops_since(
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
  where shared_projects.project_key = normalized_key;

  if not found or not public.pixieed_can_access_shared_project(normalized_key) then
    return;
  end if;

  return query
  select
    ops.project_id,
    ops.project_key,
    ops.op_id,
    coalesce(ops.seq, ops.revision) as seq,
    ops.revision,
    ops.base_revision,
    ops.base_structure_revision,
    ops.structure_revision,
    ops.op_type,
    ops.actor_user_id,
    ops.user_id,
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
    and ops.revision > normalized_after_revision
  order by ops.revision asc
  limit normalized_limit;
end;
$$;

revoke all on function public.pixieed_get_shared_project_ops_since(text, bigint, integer) from public;
grant execute on function public.pixieed_get_shared_project_ops_since(text, bigint, integer) to authenticated;

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
  provided_op_id text := nullif(trim(coalesce(op_payload->>'opId', '')), '');
  next_revision bigint;
  next_structure_revision bigint;
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

  next_revision := greatest(coalesce(project_row.latest_revision, 0), requested_base_revision) + 1;
  if normalized_op_type = 'structure' then
    next_structure_revision := greatest(coalesce(project_row.latest_structure_revision, 0), requested_base_structure_revision) + 1;
  else
    next_structure_revision := greatest(coalesce(project_row.latest_structure_revision, 0), requested_base_structure_revision);
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
    coalesce(nullif(op_payload->>'kind', ''), normalized_op_type),
    coalesce(op_payload->>'canvasId', ''),
    greatest(0, coalesce((op_payload->>'frameIndex')::integer, 0)),
    coalesce(op_payload->>'layerId', ''),
    jsonb_build_object(
      'historyLabel', normalized_history_label,
      'op', op_payload,
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
    return;
  end if;

  if requested_next_revision <= 0 then
    requested_next_revision := greatest(project_row.latest_revision, requested_base_revision);
  end if;
  requested_next_revision := least(requested_next_revision, greatest(project_row.latest_revision, requested_base_revision));
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
    latest_snapshot_revision = requested_next_revision,
    latest_snapshot_structure_revision = requested_next_structure_revision,
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

revoke all on function public.pixieed_commit_shared_project_snapshot(text, text, jsonb, bigint, bigint, bigint, bigint, text, text, jsonb) from public;
grant execute on function public.pixieed_commit_shared_project_snapshot(text, text, jsonb, bigint, bigint, bigint, bigint, text, text, jsonb) to authenticated;
