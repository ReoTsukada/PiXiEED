-- Collaboration is intentionally simple at the product surface:
-- one flow is used for casual co-drawing and for production/publication.
-- The consent screen explains both cautions; it does not force a mode choice.
--
-- This migration extends the existing collab_v1 Room/member authority. It
-- never infers rights from edit history, operation count, or pixel count.

create table if not exists collab_v1.room_scope_assignments (
  room_id uuid not null references collab_v1.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scope_key text not null check (scope_key in ('DRAW', 'AUDIO', 'GAME', 'WRITING', 'PUBLISH')),
  assignment_state text not null default 'PENDING_MEMBER'
    check (assignment_state in ('PENDING_MEMBER', 'PENDING_MASTER', 'APPROVED', 'REMOVAL_REQUESTED', 'REJECTED', 'REMOVED')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  assigned_by uuid references auth.users(id) on delete restrict,
  request_note text not null default '' check (char_length(request_note) <= 500),
  requested_at timestamptz not null default timezone('utc', now()),
  member_confirmed_at timestamptz,
  owner_decided_at timestamptz,
  removal_requested_by uuid references auth.users(id) on delete restrict,
  removal_requested_at timestamptz,
  member_decided_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (room_id, user_id, scope_key)
);

create index if not exists pixisync_scope_assignments_user_idx
  on collab_v1.room_scope_assignments (user_id, room_id, assignment_state);
create index if not exists pixisync_scope_assignments_pending_idx
  on collab_v1.room_scope_assignments (room_id, assignment_state)
  where assignment_state in ('PENDING_MEMBER', 'PENDING_MASTER', 'REMOVAL_REQUESTED');

alter table collab_v1.room_scope_assignments enable row level security;
revoke all on collab_v1.room_scope_assignments from public, anon, authenticated;

create table if not exists collab_v1.room_participation_consents (
  room_id uuid not null references collab_v1.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_version text not null
    check (consent_version = 'COLLABORATION_NOTICE_V1'),
  accepted_at timestamptz not null default timezone('utc', now()),
  primary key (room_id, user_id, consent_version)
);

create index if not exists pixisync_participation_consents_user_idx
  on collab_v1.room_participation_consents (user_id, room_id);

alter table collab_v1.room_participation_consents enable row level security;
revoke all on collab_v1.room_participation_consents from public, anon, authenticated;

create or replace function public.pixisync_accept_collaboration_consent_v1(
  p_room_id uuid,
  p_consent_version text
)
returns table (room_id uuid, user_id uuid, consent_version text, accepted_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_consent_version <> 'COLLABORATION_NOTICE_V1' then raise exception 'invalid_consent_version'; end if;
  if not exists (
    select 1
    from collab_v1.rooms as room
    join collab_v1.room_members as member on member.room_id = room.id
    where room.id = p_room_id
      and room.status = 'active'
      and member.user_id = v_user_id
      and member.revoked_at is null
  ) then
    raise exception 'active_participant_required';
  end if;
  insert into collab_v1.room_participation_consents (room_id, user_id, consent_version)
  values (p_room_id, v_user_id, p_consent_version)
  on conflict (room_id, user_id, consent_version) do update
  set accepted_at = timezone('utc', now());
  return query
    select consent.room_id, consent.user_id, consent.consent_version, consent.accepted_at
    from collab_v1.room_participation_consents as consent
    where consent.room_id = p_room_id
      and consent.user_id = v_user_id
      and consent.consent_version = p_consent_version;
end
$$;

create or replace function public.pixisync_list_scope_assignments_v1(p_room_id uuid)
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
  current_user_consented boolean
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
    )
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

create or replace function public.pixisync_set_scope_assignment_v1(
  p_room_id uuid,
  p_user_id uuid,
  p_scope_key text,
  p_enabled boolean
)
returns table (room_id uuid, user_id uuid, scope_key text, assignment_state text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_existing collab_v1.room_scope_assignments%rowtype;
  v_state text;
begin
  if v_owner_id is null then raise exception 'authentication_required'; end if;
  if p_scope_key is null or p_scope_key not in ('DRAW', 'AUDIO', 'GAME', 'WRITING', 'PUBLISH') then
    raise exception 'invalid_scope_key';
  end if;
  if p_user_id is null or p_user_id = v_owner_id then
    raise exception 'participant_required';
  end if;
  if not exists (
    select 1 from collab_v1.rooms
    where id = p_room_id and owner_user_id = v_owner_id and status = 'active'
  ) then
    raise exception 'active_owner_required';
  end if;
  if not exists (
    select 1 from collab_v1.room_participation_consents
    where room_id = p_room_id and user_id = v_owner_id
      and consent_version = 'COLLABORATION_NOTICE_V1'
  ) then
    raise exception 'collaboration_consent_required';
  end if;
  if not exists (
    select 1 from collab_v1.room_members
    where room_id = p_room_id and user_id = p_user_id and revoked_at is null
  ) then
    raise exception 'active_participant_required';
  end if;

  select * into v_existing
  from collab_v1.room_scope_assignments
  where room_id = p_room_id and user_id = p_user_id and scope_key = p_scope_key
  for update;

  if p_enabled then
    if found and v_existing.assignment_state = 'APPROVED' then
      v_state := 'APPROVED';
    elsif found and v_existing.assignment_state = 'REMOVAL_REQUESTED' then
      update collab_v1.room_scope_assignments
      set assignment_state = 'APPROVED',
          removal_requested_by = null,
          removal_requested_at = null,
          member_decided_at = null,
          updated_at = timezone('utc', now())
      where room_id = p_room_id and user_id = p_user_id and scope_key = p_scope_key;
      v_state := 'APPROVED';
    elsif found then
      update collab_v1.room_scope_assignments
      set assignment_state = 'PENDING_MEMBER',
          assigned_by = v_owner_id,
          requested_by = v_owner_id,
          requested_at = timezone('utc', now()),
          owner_decided_at = timezone('utc', now()),
          updated_at = timezone('utc', now())
      where room_id = p_room_id and user_id = p_user_id and scope_key = p_scope_key;
      v_state := 'PENDING_MEMBER';
    else
      insert into collab_v1.room_scope_assignments (
        room_id, user_id, scope_key, assignment_state, requested_by,
        assigned_by, owner_decided_at
      ) values (
        p_room_id, p_user_id, p_scope_key, 'PENDING_MEMBER', v_owner_id,
        v_owner_id, timezone('utc', now())
      );
      v_state := 'PENDING_MEMBER';
    end if;
  elsif not found or v_existing.assignment_state in ('PENDING_MEMBER', 'PENDING_MASTER', 'REJECTED', 'REMOVED') then
    if found then
      update collab_v1.room_scope_assignments
      set assignment_state = 'REMOVED',
          removal_requested_by = null,
          removal_requested_at = null,
          updated_at = timezone('utc', now())
      where room_id = p_room_id and user_id = p_user_id and scope_key = p_scope_key;
    end if;
    v_state := 'REMOVED';
  elsif v_existing.assignment_state = 'REMOVAL_REQUESTED' then
    v_state := 'REMOVAL_REQUESTED';
  else
    update collab_v1.room_scope_assignments
    set assignment_state = 'REMOVAL_REQUESTED',
        removal_requested_by = v_owner_id,
        removal_requested_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where room_id = p_room_id and user_id = p_user_id and scope_key = p_scope_key;
    v_state := 'REMOVAL_REQUESTED';
  end if;
  return query select p_room_id, p_user_id, p_scope_key, v_state;
end
$$;

create or replace function public.pixisync_request_scope_v1(
  p_room_id uuid,
  p_scope_key text,
  p_note text default ''
)
returns table (room_id uuid, user_id uuid, scope_key text, assignment_state text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing collab_v1.room_scope_assignments%rowtype;
  v_state text := 'PENDING_MASTER';
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_scope_key is null or p_scope_key not in ('DRAW', 'AUDIO', 'GAME', 'WRITING', 'PUBLISH') then
    raise exception 'invalid_scope_key';
  end if;
  if not exists (
    select 1 from collab_v1.rooms
    where id = p_room_id and status = 'active'
  ) then
    raise exception 'active_room_required';
  end if;
  if not exists (
    select 1 from collab_v1.room_members
    where room_id = p_room_id and user_id = v_user_id and revoked_at is null and role <> 'owner'
  ) then
    raise exception 'active_participant_required';
  end if;
  if not exists (
    select 1 from collab_v1.room_participation_consents
    where room_id = p_room_id and user_id = v_user_id
      and consent_version = 'COLLABORATION_NOTICE_V1'
  ) then
    raise exception 'collaboration_consent_required';
  end if;
  select * into v_existing
  from collab_v1.room_scope_assignments
  where room_id = p_room_id and user_id = v_user_id and scope_key = p_scope_key
  for update;
  if found and v_existing.assignment_state = 'APPROVED' then
    v_state := 'APPROVED';
  elsif found and v_existing.assignment_state = 'REMOVAL_REQUESTED' then
    update collab_v1.room_scope_assignments
    set assignment_state = 'APPROVED',
        removal_requested_by = null,
        removal_requested_at = null,
        member_decided_at = timezone('utc', now()),
        request_note = left(coalesce(p_note, ''), 500),
        updated_at = timezone('utc', now())
    where room_id = p_room_id and user_id = v_user_id and scope_key = p_scope_key;
    v_state := 'APPROVED';
  elsif found then
    update collab_v1.room_scope_assignments
    set assignment_state = 'PENDING_MASTER',
        requested_by = v_user_id,
        request_note = left(coalesce(p_note, ''), 500),
        requested_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where room_id = p_room_id and user_id = v_user_id and scope_key = p_scope_key;
  else
    insert into collab_v1.room_scope_assignments (
      room_id, user_id, scope_key, assignment_state, requested_by, request_note
    ) values (
      p_room_id, v_user_id, p_scope_key, 'PENDING_MASTER', v_user_id,
      left(coalesce(p_note, ''), 500)
    );
  end if;
  return query select p_room_id, v_user_id, p_scope_key, v_state;
end
$$;

create or replace function public.pixisync_review_scope_request_v1(
  p_room_id uuid,
  p_user_id uuid,
  p_scope_key text,
  p_action text
)
returns table (room_id uuid, user_id uuid, scope_key text, assignment_state text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_state text;
begin
  if v_owner_id is null then raise exception 'authentication_required'; end if;
  if p_action not in ('APPROVE', 'REJECT') then raise exception 'invalid_scope_review_action'; end if;
  if p_scope_key is null or p_scope_key not in ('DRAW', 'AUDIO', 'GAME', 'WRITING', 'PUBLISH') then raise exception 'invalid_scope_key'; end if;
  if not exists (
    select 1 from collab_v1.rooms
    where id = p_room_id and owner_user_id = v_owner_id and status = 'active'
  ) then raise exception 'active_owner_required'; end if;
  if not exists (
    select 1 from collab_v1.room_participation_consents
    where room_id = p_room_id and user_id = v_owner_id
      and consent_version = 'COLLABORATION_NOTICE_V1'
  ) then
    raise exception 'collaboration_consent_required';
  end if;
  if p_action = 'APPROVE' then
    update collab_v1.room_scope_assignments
    set assignment_state = 'APPROVED',
        owner_decided_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where room_id = p_room_id and user_id = p_user_id and scope_key = p_scope_key
      and assignment_state = 'PENDING_MASTER';
    v_state := 'APPROVED';
  else
    update collab_v1.room_scope_assignments
    set assignment_state = 'REJECTED',
        owner_decided_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where room_id = p_room_id and user_id = p_user_id and scope_key = p_scope_key
      and assignment_state = 'PENDING_MASTER';
    v_state := 'REJECTED';
  end if;
  if not found then raise exception 'scope_request_not_pending'; end if;
  return query select p_room_id, p_user_id, p_scope_key, v_state;
end
$$;

create or replace function public.pixisync_respond_scope_v1(
  p_room_id uuid,
  p_scope_key text,
  p_action text
)
returns table (room_id uuid, user_id uuid, scope_key text, assignment_state text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing collab_v1.room_scope_assignments%rowtype;
  v_state text;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_action not in ('ACCEPT_ASSIGNMENT', 'DECLINE_ASSIGNMENT', 'ACCEPT_REMOVAL', 'REJECT_REMOVAL') then
    raise exception 'invalid_scope_response_action';
  end if;
  if p_scope_key is null or p_scope_key not in ('DRAW', 'AUDIO', 'GAME', 'WRITING', 'PUBLISH') then
    raise exception 'invalid_scope_key';
  end if;
  if not exists (
    select 1 from collab_v1.rooms
    where id = p_room_id and status = 'active'
  ) then
    raise exception 'active_room_required';
  end if;
  if not exists (
    select 1 from collab_v1.room_members
    where room_id = p_room_id and user_id = v_user_id and revoked_at is null
  ) then
    raise exception 'active_participant_required';
  end if;
  if not exists (
    select 1 from collab_v1.room_participation_consents
    where room_id = p_room_id and user_id = v_user_id
      and consent_version = 'COLLABORATION_NOTICE_V1'
  ) then
    raise exception 'collaboration_consent_required';
  end if;
  select * into v_existing
  from collab_v1.room_scope_assignments
  where room_id = p_room_id and user_id = v_user_id and scope_key = p_scope_key
  for update;
  if not found then raise exception 'scope_assignment_not_found'; end if;
  if p_action in ('ACCEPT_ASSIGNMENT', 'DECLINE_ASSIGNMENT')
     and v_existing.assignment_state <> 'PENDING_MEMBER' then
    raise exception 'scope_assignment_not_pending';
  end if;
  if p_action in ('ACCEPT_REMOVAL', 'REJECT_REMOVAL')
     and v_existing.assignment_state <> 'REMOVAL_REQUESTED' then
    raise exception 'scope_removal_not_pending';
  end if;
  if p_action = 'ACCEPT_ASSIGNMENT' then
    v_state := 'APPROVED';
    update collab_v1.room_scope_assignments
    set assignment_state = 'APPROVED', member_confirmed_at = timezone('utc', now()), updated_at = timezone('utc', now())
    where room_id = p_room_id and user_id = v_user_id and scope_key = p_scope_key;
  elsif p_action = 'DECLINE_ASSIGNMENT' then
    v_state := 'REJECTED';
    update collab_v1.room_scope_assignments
    set assignment_state = 'REJECTED', member_decided_at = timezone('utc', now()), updated_at = timezone('utc', now())
    where room_id = p_room_id and user_id = v_user_id and scope_key = p_scope_key;
  elsif p_action = 'ACCEPT_REMOVAL' then
    v_state := 'REMOVED';
    update collab_v1.room_scope_assignments
    set assignment_state = 'REMOVED', member_decided_at = timezone('utc', now()), updated_at = timezone('utc', now())
    where room_id = p_room_id and user_id = v_user_id and scope_key = p_scope_key;
  else
    v_state := 'APPROVED';
    update collab_v1.room_scope_assignments
    set assignment_state = 'APPROVED', member_decided_at = timezone('utc', now()), removal_requested_by = null, removal_requested_at = null, updated_at = timezone('utc', now())
    where room_id = p_room_id and user_id = v_user_id and scope_key = p_scope_key;
  end if;
  return query select p_room_id, v_user_id, p_scope_key, v_state;
end
$$;

revoke all on function public.pixisync_accept_collaboration_consent_v1(uuid, text) from public, anon;
revoke all on function public.pixisync_list_scope_assignments_v1(uuid) from public, anon;
revoke all on function public.pixisync_set_scope_assignment_v1(uuid, uuid, text, boolean) from public, anon;
revoke all on function public.pixisync_request_scope_v1(uuid, text, text) from public, anon;
revoke all on function public.pixisync_review_scope_request_v1(uuid, uuid, text, text) from public, anon;
revoke all on function public.pixisync_respond_scope_v1(uuid, text, text) from public, anon;
grant execute on function public.pixisync_accept_collaboration_consent_v1(uuid, text) to authenticated;
grant execute on function public.pixisync_list_scope_assignments_v1(uuid) to authenticated;
grant execute on function public.pixisync_set_scope_assignment_v1(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.pixisync_request_scope_v1(uuid, text, text) to authenticated;
grant execute on function public.pixisync_review_scope_request_v1(uuid, uuid, text, text) to authenticated;
grant execute on function public.pixisync_respond_scope_v1(uuid, text, text) to authenticated;
