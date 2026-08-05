-- A room with no operations already has a verified checkpoint at revision 0.
-- Re-registering a freshly captured final snapshot must reuse that checkpoint
-- instead of violating checkpoints_room_id_revision_key. Checkpoint packages
-- include a changing updatedAt field, so the existing row is updated in place
-- and re-attested under its stable id. The returned id is consumed by the
-- client so localization can continue with the reused row.
create or replace function public.pixisync_register_checkpoint(p_room_id uuid, p_checkpoint_id uuid)
returns table (
  checkpoint_id uuid,
  revision bigint,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room collab_v1.rooms%rowtype;
  v_upload collab_v1.checkpoint_uploads%rowtype;
  v_existing collab_v1.checkpoints%rowtype;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select * into v_room from collab_v1.rooms where id = p_room_id for update;
  if not found or v_room.owner_user_id <> v_user_id or v_room.status <> 'active' then
    raise exception 'active_owner_required';
  end if;

  -- Make a retry after a successful registration idempotent.
  select * into v_existing
  from collab_v1.checkpoints as checkpoint
  where checkpoint.id = p_checkpoint_id and checkpoint.room_id = p_room_id
  for update;
  if found then
    if v_existing.revision <> v_room.head_revision then
      raise exception 'head_checkpoint_required';
    end if;
    return query select v_existing.id, v_existing.revision, v_existing.status;
    return;
  end if;

  select * into v_upload
  from collab_v1.checkpoint_uploads as upload
  where upload.room_id = p_room_id and upload.checkpoint_id = p_checkpoint_id
  for update;
  if not found or v_upload.revision <> v_room.head_revision then
    raise exception 'head_checkpoint_upload_required';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'pixisync-checkpoints'
      and name = v_upload.storage_path
  ) then
    raise exception 'checkpoint_blob_missing';
  end if;

  -- Revision 0 is normally occupied by the initial verified checkpoint. The
  -- document envelope includes a fresh updatedAt value on every capture, so
  -- byte identity is intentionally not used here. The room lock and head
  -- revision check make this the current owner's final state for this room.
  select * into v_existing
  from collab_v1.checkpoints as checkpoint
  where checkpoint.room_id = p_room_id and checkpoint.revision = v_upload.revision
  for update;
  if found and v_existing.status = 'verified' then
    delete from collab_v1.checkpoint_attestations as attestation
    where attestation.checkpoint_id = v_existing.id;
    update collab_v1.checkpoints as checkpoint
    set structure_epoch = v_room.structure_epoch,
        storage_path = v_upload.storage_path,
        state_sha256 = v_upload.state_sha256,
        encoded_bytes = v_upload.encoded_bytes,
        codec_version = v_upload.codec_version,
        status = 'verified',
        created_by = v_user_id,
        created_at = timezone('utc', now())
    where checkpoint.id = v_existing.id;
    delete from collab_v1.checkpoint_uploads as upload
    where upload.checkpoint_id = p_checkpoint_id;
    return query select v_existing.id, v_existing.revision, 'candidate'::text;
    return;
  end if;

  -- A failed previous attempt may have left a candidate at this revision.
  -- Remove that unreferenced candidate so a later localization can retry.
  if found then
    delete from collab_v1.checkpoints as checkpoint
    where checkpoint.id = v_existing.id;
  end if;

  insert into collab_v1.checkpoints (
    id, room_id, revision, structure_epoch, storage_path, state_sha256,
    encoded_bytes, codec_version, status, created_by
  ) values (
    v_upload.checkpoint_id, p_room_id, v_upload.revision, v_room.structure_epoch,
    v_upload.storage_path, v_upload.state_sha256, v_upload.encoded_bytes,
    v_upload.codec_version, 'candidate', v_user_id
  );
  delete from collab_v1.checkpoint_uploads as upload
  where upload.checkpoint_id = p_checkpoint_id;
  return query select p_checkpoint_id, v_room.head_revision, 'candidate'::text;
end
$$;

revoke all on function public.pixisync_register_checkpoint(uuid, uuid) from public, anon;
grant execute on function public.pixisync_register_checkpoint(uuid, uuid) to authenticated;
