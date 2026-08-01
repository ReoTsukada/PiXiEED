-- A checkpoint_restore operation already has an immutable, hash-checked blob
-- and a confirmed revision. Promote that blob to the room's active checkpoint
-- after its ordered operation commits. New/reopened clients then replay only
-- the tail after this known-good document boundary.

create function public.pixisync_promote_document_checkpoint(
  p_room_id uuid,
  p_upload_id uuid
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
  v_upload collab_v1.document_checkpoint_uploads%rowtype;
  v_role collab_v1.member_role;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_room_id is null or p_upload_id is null then
    raise exception 'invalid_document_checkpoint_promotion_shape';
  end if;

  select * into v_room from collab_v1.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'active' then raise exception 'room_not_active'; end if;
  select role into v_role from collab_v1.room_members
  where room_id = p_room_id and user_id = v_user_id and revoked_at is null;
  if v_role not in ('owner', 'editor') then raise exception 'not_editor'; end if;

  select * into v_upload from collab_v1.document_checkpoint_uploads
  where room_id = p_room_id and upload_id = p_upload_id
  for update;
  if not found
     or v_upload.committed_revision is null
     or v_upload.codec_version <> 1
     or not exists (
       select 1 from storage.objects
       where bucket_id = 'pixisync-checkpoints' and name = v_upload.storage_path
     ) then
    raise exception 'verified_document_checkpoint_required';
  end if;

  insert into collab_v1.checkpoints (
    id, room_id, revision, structure_epoch, storage_path, state_sha256,
    encoded_bytes, codec_version, status, created_by
  ) values (
    v_upload.upload_id, v_upload.room_id, v_upload.committed_revision,
    v_upload.structure_epoch + 1, v_upload.storage_path, v_upload.state_sha256,
    v_upload.encoded_bytes, v_upload.codec_version, 'verified', v_upload.created_by
  ) on conflict do nothing;

  if not exists (
    select 1 from collab_v1.checkpoints
    where id = v_upload.upload_id
      and room_id = p_room_id
      and revision = v_upload.committed_revision
      and status = 'verified'
  ) then
    raise exception 'document_checkpoint_promotion_conflict';
  end if;

  update collab_v1.rooms
  set active_checkpoint_id = v_upload.upload_id,
      updated_at = timezone('utc', now())
  where id = p_room_id
  returning head_revision, structure_epoch into v_room.head_revision, v_room.structure_epoch;

  return query select v_upload.upload_id, v_upload.committed_revision,
    v_room.head_revision, v_room.structure_epoch;
end
$$;

revoke all on function public.pixisync_promote_document_checkpoint(uuid, uuid) from public, anon;
grant execute on function public.pixisync_promote_document_checkpoint(uuid, uuid) to authenticated;
