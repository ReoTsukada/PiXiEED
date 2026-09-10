-- PiXYNC collaboration edit policy.
--
-- OPEN is deliberately the default: joining a room must not make a new
-- participant wonder why the canvas stopped working. A master can opt into
-- ASSIGNED_ONLY when the project needs responsibility boundaries. The
-- database remains the authority so a client cannot bypass the rule.

alter table collab_v1.rooms
  add column if not exists edit_scope_policy text;

update collab_v1.rooms
set edit_scope_policy = 'OPEN'
where edit_scope_policy is null;

alter table collab_v1.rooms
  alter column edit_scope_policy set default 'OPEN';
alter table collab_v1.rooms
  alter column edit_scope_policy set not null;
alter table collab_v1.rooms
  drop constraint if exists pixisync_rooms_edit_scope_policy_check;
alter table collab_v1.rooms
  add constraint pixisync_rooms_edit_scope_policy_check
  check (edit_scope_policy in ('OPEN', 'ASSIGNED_ONLY'));

create or replace function collab_v1.scope_allows_edit(
  p_room_id uuid,
  p_user_id uuid,
  p_scope_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_room collab_v1.rooms%rowtype;
begin
  -- The actor written by a trusted commit RPC must be the authenticated
  -- caller. This also makes a future direct trigger path fail closed.
  if p_user_id is null or p_user_id is distinct from auth.uid() then
    return false;
  end if;
  if p_scope_key is null or p_scope_key not in ('DRAW', 'AUDIO', 'GAME') then
    return false;
  end if;
  select * into v_room
  from collab_v1.rooms
  where id = p_room_id and status = 'active';
  if not found then return false; end if;
  if not exists (
    select 1
    from collab_v1.room_members as member
    where member.room_id = p_room_id
      and member.user_id = p_user_id
      and member.revoked_at is null
  ) then
    return false;
  end if;
  if v_room.owner_user_id = p_user_id or v_room.edit_scope_policy = 'OPEN' then
    return true;
  end if;
  return exists (
    select 1
    from collab_v1.room_scope_assignments as assignment
    where assignment.room_id = p_room_id
      and assignment.user_id = p_user_id
      and assignment.scope_key = p_scope_key
      and assignment.assignment_state = 'APPROVED'
  );
end
$$;

create or replace function collab_v1.enforce_edit_scope_draw2_operation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope_key text := case new.aggregate
    when 'draw' then 'DRAW'
    when 'audio' then 'AUDIO'
    when 'game' then 'GAME'
    else null
  end;
begin
  if not collab_v1.scope_allows_edit(new.room_id, new.actor_user_id, v_scope_key) then
    raise exception 'scope_assignment_required'
      using errcode = '42501',
        detail = 'The master currently allows edits only in an approved scope.';
  end if;
  return new;
end
$$;

create or replace function collab_v1.enforce_edit_scope_game_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not collab_v1.scope_allows_edit(new.room_id, new.created_by, 'GAME') then
    raise exception 'scope_assignment_required'
      using errcode = '42501',
        detail = 'The master currently allows edits only in an approved scope.';
  end if;
  return new;
end
$$;

create or replace function collab_v1.enforce_edit_scope_legacy_operation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not collab_v1.scope_allows_edit(new.room_id, new.actor_user_id, 'DRAW') then
    raise exception 'scope_assignment_required'
      using errcode = '42501',
        detail = 'The master currently allows edits only in an approved scope.';
  end if;
  return new;
end
$$;

drop trigger if exists pixync_edit_scope_draw2_operation
  on collab_v1.draw2_operations;
create trigger pixync_edit_scope_draw2_operation
before insert on collab_v1.draw2_operations
for each row execute function collab_v1.enforce_edit_scope_draw2_operation();

drop trigger if exists pixync_edit_scope_game_revision
  on collab_v1.draw2_game_revisions;
create trigger pixync_edit_scope_game_revision
before insert on collab_v1.draw2_game_revisions
for each row execute function collab_v1.enforce_edit_scope_game_revision();

drop trigger if exists pixync_edit_scope_legacy_operation
  on collab_v1.operations;
create trigger pixync_edit_scope_legacy_operation
before insert on collab_v1.operations
for each row execute function collab_v1.enforce_edit_scope_legacy_operation();

create or replace function public.pixisync_set_edit_scope_policy_v1(
  p_room_id uuid,
  p_policy text
)
returns table (room_id uuid, edit_scope_policy text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_policy text := upper(trim(coalesce(p_policy, '')));
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if v_policy not in ('OPEN', 'ASSIGNED_ONLY') then
    raise exception 'invalid_edit_scope_policy';
  end if;
  if not exists (
    select 1
    from collab_v1.rooms as room
    where room.id = p_room_id
      and room.owner_user_id = v_user_id
      and room.status = 'active'
  ) then
    raise exception 'active_owner_required';
  end if;
  if not exists (
    select 1
    from collab_v1.room_participation_consents as consent
    where consent.room_id = p_room_id
      and consent.user_id = v_user_id
      and consent.consent_version = 'COLLABORATION_NOTICE_V1'
  ) then
    raise exception 'collaboration_consent_required';
  end if;
  update collab_v1.rooms
  set edit_scope_policy = v_policy,
      updated_at = timezone('utc', now())
  where id = p_room_id;
  return query
    select room.id, room.edit_scope_policy
    from collab_v1.rooms as room
    where room.id = p_room_id;
end
$$;

drop function if exists public.pixisync_list_scope_assignments_v1(uuid);
create function public.pixisync_list_scope_assignments_v1(p_room_id uuid)
returns table (
  room_id uuid,
  user_id uuid,
  member_role text,
  display_name text,
  scope_key text,
  assignment_state text,
  requested_by uuid,
  requested_at timestamptz,
  member_confirmed_at timestamptz,
  owner_decided_at timestamptz,
  removal_requested_at timestamptz,
  can_manage boolean,
  is_current_user boolean,
  current_user_consented boolean,
  edit_scope_policy text
)
language sql
stable
security definer
set search_path = ''
as $$
  with scope_catalog(scope_key) as (
    values ('DRAW'::text), ('AUDIO'::text), ('GAME'::text),
      ('WRITING'::text), ('PUBLISH'::text)
  )
  select
    room.id,
    member.user_id,
    member.role::text,
    coalesce(nullif(profile.nickname, ''), '参加者')::text,
    scope_catalog.scope_key,
    assignment.assignment_state,
    assignment.requested_by,
    assignment.requested_at,
    assignment.member_confirmed_at,
    assignment.owner_decided_at,
    assignment.removal_requested_at,
    (room.owner_user_id = auth.uid()),
    (member.user_id = auth.uid()),
    exists (
      select 1 from collab_v1.room_participation_consents as consent
      where consent.room_id = room.id
        and consent.user_id = auth.uid()
        and consent.consent_version = 'COLLABORATION_NOTICE_V1'
    ),
    room.edit_scope_policy
  from collab_v1.rooms as room
  join collab_v1.room_members as member
    on member.room_id = room.id and member.revoked_at is null
  cross join scope_catalog
  left join collab_v1.room_scope_assignments as assignment
    on assignment.room_id = member.room_id
   and assignment.user_id = member.user_id
   and assignment.scope_key = scope_catalog.scope_key
  left join public.user_profiles as profile on profile.id = member.user_id
  where room.id = p_room_id
    and room.status = 'active'
    and exists (
      select 1 from collab_v1.room_members as viewer
      where viewer.room_id = room.id
        and viewer.user_id = auth.uid()
        and viewer.revoked_at is null
    )
  order by member.role::text, member.joined_at, member.user_id, scope_catalog.scope_key;
$$;

revoke all on function collab_v1.scope_allows_edit(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function collab_v1.enforce_edit_scope_draw2_operation()
  from public, anon, authenticated;
revoke all on function collab_v1.enforce_edit_scope_game_revision()
  from public, anon, authenticated;
revoke all on function collab_v1.enforce_edit_scope_legacy_operation()
  from public, anon, authenticated;
revoke all on function public.pixisync_set_edit_scope_policy_v1(uuid, text)
  from public, anon;
revoke all on function public.pixisync_list_scope_assignments_v1(uuid)
  from public, anon;
grant execute on function public.pixisync_set_edit_scope_policy_v1(uuid, text)
  to authenticated;
grant execute on function public.pixisync_list_scope_assignments_v1(uuid)
  to authenticated;
