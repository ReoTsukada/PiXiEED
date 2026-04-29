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
