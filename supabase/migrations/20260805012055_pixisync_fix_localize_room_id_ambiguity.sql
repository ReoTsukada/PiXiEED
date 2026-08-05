-- The RETURNS TABLE room_id output variable conflicts with the checkpoint
-- column when the checkpoint lookup leaves room_id unqualified.
create or replace function public.pixisync_begin_room_localization(
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

  select * into v_room
  from collab_v1.rooms
  where id = p_room_id
  for update;
  if not found or v_room.owner_user_id <> v_user_id or v_room.status <> 'active' then
    raise exception 'active_owner_required';
  end if;

  select * into v_checkpoint
  from collab_v1.checkpoints as checkpoint
  where checkpoint.id = p_final_checkpoint_id
    and checkpoint.room_id = p_room_id
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
  where collab_v1.room_invites.room_id = p_room_id
    and revoked_at is null;

  insert into collab_v1.room_localization_members (room_id, user_id, role)
  select member.room_id, member.user_id, member.role
  from collab_v1.room_members as member
  where member.room_id = p_room_id
    and member.revoked_at is null
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

revoke all on function public.pixisync_begin_room_localization(uuid, uuid) from public, anon;
grant execute on function public.pixisync_begin_room_localization(uuid, uuid) to authenticated;
