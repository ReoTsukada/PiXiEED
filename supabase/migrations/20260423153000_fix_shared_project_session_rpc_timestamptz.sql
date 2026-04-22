create or replace function public.pixieed_claim_shared_project_session(
  target_project_key text,
  target_project_id uuid default null,
  target_device_id text default '',
  target_session_id text default ''
)
returns table (
  allowed boolean,
  conflict_reason text,
  conflicting_device_id text,
  active_heartbeat_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_project_key text := nullif(trim(target_project_key), '');
  normalized_device_id text := nullif(trim(target_device_id), '');
  normalized_session_id text := nullif(trim(target_session_id), '');
  member_row public.shared_project_members%rowtype;
  current_ts timestamptz := now();
  active_cutoff timestamptz := current_ts - interval '45 seconds';
begin
  if current_user_id is null or normalized_project_key is null or normalized_device_id is null or normalized_session_id is null then
    return query select false, 'invalid-session-claim', null::text, null::timestamptz;
    return;
  end if;

  select *
  into member_row
  from public.shared_project_members
  where project_key = normalized_project_key
    and user_id = current_user_id
  for update;

  if not found then
    return query select false, 'membership-missing', null::text, null::timestamptz;
    return;
  end if;

  if member_row.active_session_id is not null
     and member_row.active_heartbeat_at is not null
     and member_row.active_heartbeat_at > active_cutoff
     and member_row.active_session_id <> normalized_session_id
     and coalesce(member_row.active_device_id, '') <> normalized_device_id then
    return query select false, 'same-account-active-elsewhere', member_row.active_device_id, member_row.active_heartbeat_at;
    return;
  end if;

  update public.shared_project_members
  set
    project_id = coalesce(target_project_id, project_id),
    active_device_id = normalized_device_id,
    active_session_id = normalized_session_id,
    active_heartbeat_at = current_ts,
    last_opened_at = current_ts
  where project_key = normalized_project_key
    and user_id = current_user_id;

  return query select true, ''::text, null::text, current_ts;
end;
$$;

revoke all on function public.pixieed_claim_shared_project_session(text, uuid, text, text) from public;
grant execute on function public.pixieed_claim_shared_project_session(text, uuid, text, text) to authenticated;

create or replace function public.pixieed_release_shared_project_session(
  target_project_key text,
  target_session_id text default ''
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_project_key text := nullif(trim(target_project_key), '');
  normalized_session_id text := nullif(trim(target_session_id), '');
begin
  if current_user_id is null or normalized_project_key is null or normalized_session_id is null then
    return false;
  end if;

  update public.shared_project_members
  set
    active_device_id = null,
    active_session_id = null,
    active_heartbeat_at = null,
    last_closed_at = now()
  where project_key = normalized_project_key
    and user_id = current_user_id
    and active_session_id = normalized_session_id;

  return found;
end;
$$;

revoke all on function public.pixieed_release_shared_project_session(text, text) from public;
grant execute on function public.pixieed_release_shared_project_session(text, text) to authenticated;

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
    ops.created_at::timestamptz
  from public.shared_project_ops as ops
  where ops.project_id = project_row.id
    and coalesce(ops.seq, ops.revision) > normalized_after_revision
  order by coalesce(ops.seq, ops.revision) asc
  limit normalized_limit;
end;
$$;

revoke all on function public.pixieed_get_shared_project_ops_since(text, bigint, integer) from public;
grant execute on function public.pixieed_get_shared_project_ops_since(text, bigint, integer) to authenticated;
