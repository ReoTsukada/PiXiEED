-- PiXiSYNC always includes exactly one free owned-room slot. Existing rooms
-- above that limit remain untouched, but they are not converted into a larger
-- entitlement. Owners can localize rooms until they are within the limit or
-- buy additional permanent slots.

update collab_v1.project_slot_entitlements
set included_slots = 1,
    updated_at = timezone('utc', now())
where included_slots <> 1;

alter table collab_v1.project_slot_entitlements
  drop constraint if exists project_slot_entitlements_included_slots_check;
alter table collab_v1.project_slot_entitlements
  add constraint project_slot_entitlements_included_slots_check check (included_slots = 1);
alter table collab_v1.project_slot_entitlements
  alter column included_slots set default 1;

create table collab_v1.room_localizations (
  room_id uuid primary key references collab_v1.rooms(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  final_checkpoint_id uuid not null,
  expected_members integer not null check (expected_members > 0),
  localized_members integer not null default 0 check (localized_members >= 0),
  started_at timestamptz not null default timezone('utc', now()),
  ready_at timestamptz,
  cleanup_claimed_at timestamptz,
  cleanup_completed_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  check (localized_members <= expected_members)
);

create table collab_v1.room_localization_members (
  room_id uuid not null references collab_v1.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role collab_v1.member_role not null,
  localized_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (room_id, user_id)
);

create index room_localizations_cleanup_ready_idx
  on collab_v1.room_localizations (ready_at, cleanup_claimed_at)
  where ready_at is not null and cleanup_completed_at is null;

alter table collab_v1.room_localizations enable row level security;
alter table collab_v1.room_localization_members enable row level security;
revoke all on table collab_v1.room_localizations from public, anon, authenticated;
revoke all on table collab_v1.room_localization_members from public, anon, authenticated;

drop function if exists public.pixisync_get_project_slot_status();
create function public.pixisync_get_project_slot_status()
returns table (
  included_slots integer,
  purchased_slots integer,
  allowed_slots integer,
  open_owned_projects integer,
  available_slots integer,
  over_limit_projects integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_purchased integer;
  v_open integer;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select coalesce(sum(purchase.quantity), 0)::integer
  into v_purchased
  from collab_v1.project_slot_purchases as purchase
  where purchase.user_id = v_user_id
    and purchase.status = 'paid';

  select count(*)::integer
  into v_open
  from collab_v1.rooms as room
  where room.owner_user_id = v_user_id
    and room.status in ('initializing', 'active');

  return query select
    1,
    v_purchased,
    1 + v_purchased,
    v_open,
    greatest(0, 1 + v_purchased - v_open),
    greatest(0, v_open - (1 + v_purchased));
end
$$;

revoke all on function public.pixisync_get_project_slot_status() from public, anon;
grant execute on function public.pixisync_get_project_slot_status() to authenticated;

create function public.pixisync_list_owned_open_rooms()
returns table (
  room_id uuid,
  title text,
  room_status text,
  member_count integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select room.id,
         room.title,
         room.status,
         count(member.user_id) filter (where member.revoked_at is null)::integer,
         room.created_at
  from collab_v1.rooms as room
  left join collab_v1.room_members as member on member.room_id = room.id
  where auth.uid() is not null
    and room.owner_user_id = auth.uid()
    and room.status in ('initializing', 'active')
  group by room.id, room.title, room.status, room.created_at
  order by room.created_at desc
$$;

revoke all on function public.pixisync_list_owned_open_rooms() from public, anon;
grant execute on function public.pixisync_list_owned_open_rooms() to authenticated;

create function public.pixisync_begin_room_localization(
  p_room_id uuid,
  p_final_checkpoint_id uuid
)
returns table (
  room_id uuid,
  room_status text,
  expected_members integer,
  localized_members integer,
  cleanup_ready boolean,
  session_generation bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room collab_v1.rooms%rowtype;
  v_checkpoint collab_v1.checkpoints%rowtype;
  v_localization collab_v1.room_localizations%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select * into v_room from collab_v1.rooms where id = p_room_id for update;
  if not found or v_room.owner_user_id <> v_user_id or v_room.status <> 'active' then
    raise exception 'active_owner_required';
  end if;
  select * into v_checkpoint
  from collab_v1.checkpoints
  where id = p_final_checkpoint_id and room_id = p_room_id
  for update;
  if not found or v_checkpoint.status <> 'verified' or v_checkpoint.revision <> v_room.head_revision then
    raise exception 'verified_head_checkpoint_required';
  end if;

  update collab_v1.rooms as room
  set status = 'archived',
      active_checkpoint_id = p_final_checkpoint_id,
      session_generation = room.session_generation + 1,
      updated_at = v_now
  where room.id = p_room_id
  returning * into v_room;

  update collab_v1.room_invites
  set revoked_at = coalesce(revoked_at, v_now)
  where collab_v1.room_invites.room_id = p_room_id and revoked_at is null;

  insert into collab_v1.room_localization_members (room_id, user_id, role)
  select member.room_id, member.user_id, member.role
  from collab_v1.room_members as member
  where member.room_id = p_room_id and member.revoked_at is null
  on conflict (room_id, user_id) do nothing;

  insert into collab_v1.room_localizations (
    room_id, owner_user_id, final_checkpoint_id, expected_members
  )
  select p_room_id, v_user_id, p_final_checkpoint_id, count(*)::integer
  from collab_v1.room_localization_members as target
  where target.room_id = p_room_id
  returning * into v_localization;

  return query select
    v_room.id,
    v_room.status,
    v_localization.expected_members,
    v_localization.localized_members,
    false,
    v_room.session_generation;
end
$$;

create function public.pixisync_open_localization_snapshot(p_room_id uuid)
returns table (
  room_id uuid,
  role text,
  checkpoint_id uuid,
  checkpoint_revision bigint,
  storage_path text,
  state_sha256_hex text,
  encoded_bytes integer,
  codec_version smallint,
  expected_members integer,
  localized_members integer,
  already_localized boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select room.id,
         target.role::text,
         checkpoint.id,
         checkpoint.revision,
         checkpoint.storage_path,
         encode(checkpoint.state_sha256, 'hex'),
         checkpoint.encoded_bytes,
         checkpoint.codec_version,
         localization.expected_members,
         localization.localized_members,
         target.localized_at is not null
  from collab_v1.rooms as room
  join collab_v1.room_localizations as localization on localization.room_id = room.id
  join collab_v1.room_localization_members as target
    on target.room_id = room.id and target.user_id = auth.uid()
  join collab_v1.checkpoints as checkpoint
    on checkpoint.id = localization.final_checkpoint_id
   and checkpoint.room_id = room.id
   and checkpoint.status = 'verified'
  where auth.uid() is not null
    and room.id = p_room_id
    and room.status = 'archived'
$$;

create function public.pixisync_ack_room_localized(p_room_id uuid)
returns table (
  room_id uuid,
  expected_members integer,
  localized_members integer,
  cleanup_ready boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_localization collab_v1.room_localizations%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  perform 1 from collab_v1.rooms where id = p_room_id and status = 'archived' for update;
  if not found then raise exception 'localized_room_required'; end if;

  update collab_v1.room_localization_members
  set localized_at = coalesce(localized_at, v_now),
      updated_at = v_now
  where collab_v1.room_localization_members.room_id = p_room_id
    and user_id = v_user_id;
  if not found then raise exception 'localization_membership_required'; end if;

  update collab_v1.room_localizations as localization
  set localized_members = (
        select count(*)::integer
        from collab_v1.room_localization_members as target
        where target.room_id = p_room_id and target.localized_at is not null
      ),
      ready_at = case
        when not exists (
          select 1 from collab_v1.room_localization_members as target
          where target.room_id = p_room_id and target.localized_at is null
        ) then coalesce(localization.ready_at, v_now)
        else null
      end,
      updated_at = v_now
  where localization.room_id = p_room_id
  returning * into v_localization;

  return query select
    p_room_id,
    v_localization.expected_members,
    v_localization.localized_members,
    v_localization.ready_at is not null;
end
$$;

create function public.pixisync_list_ready_localized_room_cleanups()
returns table (room_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select localization.room_id
  from collab_v1.room_localizations as localization
  join collab_v1.room_localization_members as target
    on target.room_id = localization.room_id
   and target.user_id = auth.uid()
   and target.localized_at is not null
  where auth.uid() is not null
    and localization.ready_at is not null
    and localization.cleanup_completed_at is null
$$;

create function collab_v1.refresh_room_localization_after_target_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
begin
  update collab_v1.room_localizations as localization
  set expected_members = (
        select count(*)::integer
        from collab_v1.room_localization_members as target
        where target.room_id = old.room_id
      ),
      localized_members = (
        select count(*)::integer
        from collab_v1.room_localization_members as target
        where target.room_id = old.room_id and target.localized_at is not null
      ),
      ready_at = case
        when not exists (
          select 1 from collab_v1.room_localization_members as target
          where target.room_id = old.room_id and target.localized_at is null
        ) then coalesce(localization.ready_at, v_now)
        else null
      end,
      updated_at = v_now
  where localization.room_id = old.room_id
    and exists (
      select 1 from collab_v1.room_localization_members as target
      where target.room_id = old.room_id
    );
  return old;
end
$$;

create trigger room_localization_target_delete_refresh
after delete on collab_v1.room_localization_members
for each row execute function collab_v1.refresh_room_localization_after_target_delete();

revoke all on function public.pixisync_begin_room_localization(uuid, uuid) from public, anon;
grant execute on function public.pixisync_begin_room_localization(uuid, uuid) to authenticated;
revoke all on function public.pixisync_open_localization_snapshot(uuid) from public, anon;
grant execute on function public.pixisync_open_localization_snapshot(uuid) to authenticated;
revoke all on function public.pixisync_ack_room_localized(uuid) from public, anon;
grant execute on function public.pixisync_ack_room_localized(uuid) to authenticated;
revoke all on function public.pixisync_list_ready_localized_room_cleanups() from public, anon;
grant execute on function public.pixisync_list_ready_localized_room_cleanups() to authenticated;
revoke all on function collab_v1.refresh_room_localization_after_target_delete() from public, anon, authenticated;

create function public.pixisync_claim_localized_room_cleanup_v1(
  input_room_id uuid,
  input_user_id uuid
)
returns table (room_id uuid, storage_prefix text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_localization collab_v1.room_localizations%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  if input_user_id is null then raise exception 'user_required'; end if;
  if not exists (
    select 1 from collab_v1.room_localization_members as target
    where target.room_id = input_room_id
      and target.user_id = input_user_id
      and target.localized_at is not null
  ) then raise exception 'localized_member_required'; end if;

  select * into v_localization
  from collab_v1.room_localizations
  where collab_v1.room_localizations.room_id = input_room_id
  for update;
  if not found or v_localization.ready_at is null then raise exception 'localization_not_ready'; end if;
  if v_localization.cleanup_completed_at is not null then return; end if;
  if v_localization.cleanup_claimed_at is not null
     and v_localization.cleanup_claimed_at > v_now - interval '10 minutes' then
    raise exception 'cleanup_already_claimed';
  end if;

  update collab_v1.room_localizations
  set cleanup_claimed_at = v_now, updated_at = v_now
  where collab_v1.room_localizations.room_id = input_room_id;
  return query select input_room_id, 'rooms/' || input_room_id::text;
end
$$;

create function public.pixisync_finalize_localized_room_cleanup_v1(input_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from collab_v1.room_localizations as localization
    where localization.room_id = input_room_id
      and localization.ready_at is not null
      and localization.cleanup_claimed_at is not null
      and localization.cleanup_completed_at is null
  ) then raise exception 'cleanup_claim_required'; end if;
  if exists (
    select 1 from storage.objects as object
    where object.bucket_id = 'pixisync-checkpoints'
      and object.name like 'rooms/' || input_room_id::text || '/%'
  ) then raise exception 'room_storage_objects_remain'; end if;

  delete from collab_v1.operation_guard_audits where room_id = input_room_id;
  delete from collab_v1.rooms where id = input_room_id and status = 'archived';
  return found;
end
$$;

revoke all on function public.pixisync_claim_localized_room_cleanup_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.pixisync_finalize_localized_room_cleanup_v1(uuid) from public, anon, authenticated;
grant execute on function public.pixisync_claim_localized_room_cleanup_v1(uuid, uuid) to service_role;
grant execute on function public.pixisync_finalize_localized_room_cleanup_v1(uuid) to service_role;

create or replace function collab_v1.enforce_single_owned_open_room()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_purchased_slots integer;
  v_existing_open integer;
begin
  if new.status in ('initializing', 'active')
    and (
      tg_op = 'INSERT'
      or old.status not in ('initializing', 'active')
      or new.owner_user_id is distinct from old.owner_user_id
    )
  then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(new.owner_user_id::text, 20260803)
    );
    select coalesce(sum(purchase.quantity), 0)::integer
    into v_purchased_slots
    from collab_v1.project_slot_purchases as purchase
    where purchase.user_id = new.owner_user_id and purchase.status = 'paid';
    select count(*)::integer
    into v_existing_open
    from collab_v1.rooms as room
    where room.owner_user_id = new.owner_user_id
      and room.status in ('initializing', 'active')
      and room.id <> new.id;
    if v_existing_open >= 1 + v_purchased_slots then
      raise exception using errcode = 'P0001', message = 'pixisync_owner_room_limit_reached';
    end if;
  end if;
  return new;
end
$$;

revoke all on function collab_v1.enforce_single_owned_open_room() from public, anon, authenticated;

create or replace function public.pixisync_detach_deleted_project(p_room_id uuid)
returns table (
  room_id uuid,
  action text,
  room_status text,
  session_generation bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room collab_v1.rooms%rowtype;
  v_member collab_v1.room_members%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select * into v_room from collab_v1.rooms where id = p_room_id for update;
  if not found then
    return query select p_room_id, 'already_detached'::text, 'missing'::text, 0::bigint;
    return;
  end if;
  if v_room.owner_user_id = v_user_id then
    if v_room.status in ('initializing', 'active') then
      raise exception 'pixisync_localization_required';
    end if;
    if exists (
      select 1 from collab_v1.room_localization_members as target
      where target.room_id = p_room_id
        and target.user_id = v_user_id
        and target.localized_at is null
    ) then
      raise exception 'pixisync_localization_required';
    end if;
    return query select v_room.id, 'owner_localized'::text, v_room.status, v_room.session_generation;
    return;
  end if;
  select * into v_member
  from collab_v1.room_members as member
  where member.room_id = p_room_id and member.user_id = v_user_id
  for update;
  if not found then raise exception 'membership_required'; end if;
  if v_member.revoked_at is null then
    update collab_v1.room_members
    set revoked_at = v_now
    where collab_v1.room_members.room_id = p_room_id and user_id = v_user_id;
  end if;
  return query select v_room.id, 'participant_left'::text, v_room.status, v_room.session_generation;
end
$$;

revoke all on function public.pixisync_detach_deleted_project(uuid) from public, anon;
grant execute on function public.pixisync_detach_deleted_project(uuid) to authenticated;
