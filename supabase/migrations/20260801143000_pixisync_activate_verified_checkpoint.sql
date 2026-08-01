-- A verified head checkpoint can safely replace an obsolete active checkpoint
-- without changing the room URL, membership, or ordered operation history.
-- This is used only by the owner recovery path after a legacy tail can no
-- longer be applied by a current client.

create function public.pixisync_activate_verified_checkpoint(
  p_room_id uuid,
  p_checkpoint_id uuid
)
returns table (
  checkpoint_id uuid,
  checkpoint_revision bigint,
  head_revision bigint,
  structure_epoch bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room collab_v1.rooms%rowtype;
  v_checkpoint collab_v1.checkpoints%rowtype;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_room_id is null or p_checkpoint_id is null then
    raise exception 'invalid_checkpoint_activation_shape';
  end if;

  select * into v_room from collab_v1.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'active' or v_room.owner_user_id <> v_user_id then
    raise exception 'active_owner_required';
  end if;
  select * into v_checkpoint from collab_v1.checkpoints
  where id = p_checkpoint_id and room_id = p_room_id
  for update;
  if not found
     or v_checkpoint.status <> 'verified'
     or v_checkpoint.revision <> v_room.head_revision then
    raise exception 'verified_head_checkpoint_required';
  end if;

  update collab_v1.rooms
  set active_checkpoint_id = v_checkpoint.id,
      updated_at = timezone('utc', now())
  where id = p_room_id
  returning head_revision, structure_epoch into v_room.head_revision, v_room.structure_epoch;

  return query select v_checkpoint.id, v_checkpoint.revision,
    v_room.head_revision, v_room.structure_epoch;
end
$$;

revoke all on function public.pixisync_activate_verified_checkpoint(uuid, uuid) from public, anon;
grant execute on function public.pixisync_activate_verified_checkpoint(uuid, uuid) to authenticated;
