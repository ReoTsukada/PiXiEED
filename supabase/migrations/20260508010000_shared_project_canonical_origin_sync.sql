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

  if requested_base_revision <> coalesce(project_row.latest_revision, 0) then
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
      'stale-base-revision'::text,
      project_row.updated_at,
      project_row.created_at,
      project_row.latest_revision,
      project_row.latest_structure_revision;
    return;
  end if;

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

  if coalesce(op_payload->>'frameIndex', '') ~ '^-?[0-9]+$' then
    frame_index_value := greatest(0, (op_payload->>'frameIndex')::integer);
  end if;

  next_revision := coalesce(project_row.latest_revision, 0) + 1;
  if normalized_op_type = 'structure' then
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
    coalesce(nullif(op_payload->>'kind', ''), normalized_op_type),
    coalesce(op_payload->>'canvasId', ''),
    frame_index_value,
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
