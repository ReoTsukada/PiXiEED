alter table public.shared_project_members
  add column if not exists active_device_id text,
  add column if not exists active_session_id text,
  add column if not exists active_heartbeat_at timestamptz,
  add column if not exists last_closed_at timestamptz;

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
  active_cutoff timestamptz := timezone('utc', now()) - interval '45 seconds';
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
    active_heartbeat_at = timezone('utc', now()),
    last_opened_at = timezone('utc', now())
  where project_key = normalized_project_key
    and user_id = current_user_id;

  return query select true, ''::text, null::text, timezone('utc', now());
end;
$$;

revoke all on function public.pixieed_claim_shared_project_session(text, uuid, text, text) from public;
grant execute on function public.pixieed_claim_shared_project_session(text, uuid, text, text) to authenticated;

create or replace function public.pixieed_touch_shared_project_session(
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
    active_heartbeat_at = timezone('utc', now()),
    last_opened_at = timezone('utc', now())
  where project_key = normalized_project_key
    and user_id = current_user_id
    and active_session_id = normalized_session_id;

  return found;
end;
$$;

revoke all on function public.pixieed_touch_shared_project_session(text, text) from public;
grant execute on function public.pixieed_touch_shared_project_session(text, text) to authenticated;

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
    last_closed_at = timezone('utc', now())
  where project_key = normalized_project_key
    and user_id = current_user_id
    and active_session_id = normalized_session_id;

  return found;
end;
$$;

revoke all on function public.pixieed_release_shared_project_session(text, text) from public;
grant execute on function public.pixieed_release_shared_project_session(text, text) to authenticated;
