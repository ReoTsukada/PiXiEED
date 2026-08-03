-- End the PiXiSYNC relationship before an on-device project card is deleted.
-- Owners archive the whole room and revoke every invite/member. Participants
-- revoke only their own membership. The operation is intentionally idempotent.

create function public.pixisync_detach_deleted_project(p_room_id uuid)
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

  select * into v_room
  from collab_v1.rooms
  where id = p_room_id
  for update;
  if not found then
    return query select p_room_id, 'already_detached'::text, 'missing'::text, 0::bigint;
    return;
  end if;

  if v_room.owner_user_id = v_user_id then
    if v_room.status in ('initializing', 'active') then
      update collab_v1.rooms as room
      set status = 'archived',
          session_generation = room.session_generation + 1,
          updated_at = v_now
      where room.id = p_room_id
      returning * into v_room;
    end if;

    update collab_v1.room_invites
    set revoked_at = coalesce(revoked_at, v_now)
    where collab_v1.room_invites.room_id = p_room_id
      and revoked_at is null;

    update collab_v1.room_members
    set revoked_at = coalesce(revoked_at, v_now)
    where collab_v1.room_members.room_id = p_room_id
      and revoked_at is null;

    return query
    select v_room.id, 'owner_archived'::text, v_room.status, v_room.session_generation;
    return;
  end if;

  select * into v_member
  from collab_v1.room_members as member
  where member.room_id = p_room_id
    and member.user_id = v_user_id
  for update;
  if not found then raise exception 'membership_required'; end if;

  if v_member.revoked_at is null then
    update collab_v1.room_members
    set revoked_at = v_now
    where collab_v1.room_members.room_id = p_room_id
      and user_id = v_user_id;
  end if;

  return query
  select v_room.id, 'participant_left'::text, v_room.status, v_room.session_generation;
end
$$;

revoke all on function public.pixisync_detach_deleted_project(uuid) from public, anon;
grant execute on function public.pixisync_detach_deleted_project(uuid) to authenticated;
