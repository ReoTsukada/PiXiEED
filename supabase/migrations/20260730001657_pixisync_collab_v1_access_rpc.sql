-- SECURITY BOUNDARY: browser clients only execute the narrowly-scoped RPCs below.
create or replace function collab_v1.is_active_member(p_room_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1 from collab_v1.room_members as member
    where member.room_id = p_room_id and member.user_id = p_user_id and member.revoked_at is null
  )
$$;

revoke all on function collab_v1.is_active_member(uuid, uuid) from public, anon, authenticated;

create policy pixisync_rooms_active_member_read on collab_v1.rooms for select to authenticated
  using (collab_v1.is_active_member(id));
create policy pixisync_room_members_active_member_read on collab_v1.room_members for select to authenticated
  using (collab_v1.is_active_member(room_id));
create policy pixisync_operations_active_member_read on collab_v1.operations for select to authenticated
  using (collab_v1.is_active_member(room_id));
create policy pixisync_checkpoints_active_member_read on collab_v1.checkpoints for select to authenticated
  using (collab_v1.is_active_member(room_id));
create policy pixisync_checkpoint_attestations_active_member_read on collab_v1.checkpoint_attestations for select to authenticated
  using (exists (select 1 from collab_v1.checkpoints as checkpoint where checkpoint.id = checkpoint_attestations.checkpoint_id and collab_v1.is_active_member(checkpoint.room_id)));

-- Private Realtime channels must also have public channel authorization disabled
-- in the Supabase Dashboard before this migration is released.
create policy pixisync_realtime_member_receive on realtime.messages for select to authenticated
  using (
    realtime.topic() like 'pixisync:room:%'
    and exists (
      select 1 from collab_v1.rooms as room
      where realtime.topic() = 'pixisync:room:' || room.id::text
        and collab_v1.is_active_member(room.id)
    )
  );
create policy pixisync_realtime_editor_send on realtime.messages for insert to authenticated
  with check (
    realtime.topic() like 'pixisync:room:%'
    and exists (
      select 1 from collab_v1.room_members as member
      where realtime.topic() = 'pixisync:room:' || member.room_id::text
        and member.user_id = auth.uid()
        and member.revoked_at is null
        and member.role in ('owner', 'editor')
    )
  );

create or replace function public.pixisync_create_room(p_title text default '')
returns table (room_id uuid, revision bigint, role text)
language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_room_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  insert into collab_v1.rooms (owner_user_id, title) values (v_user_id, left(coalesce(p_title, ''), 120)) returning id into v_room_id;
  insert into collab_v1.room_members (room_id, user_id, role) values (v_room_id, v_user_id, 'owner');
  return query select v_room_id, 0::bigint, 'owner'::text;
end $$;

create or replace function public.pixisync_get_ops_since(p_room_id uuid, p_after_revision bigint default 0, p_limit integer default 250)
returns table (revision bigint, operation_id uuid, actor_user_id uuid, actor_client_id uuid, kind text, structure_epoch bigint, codec_version smallint, payload_b64 text, payload_sha256_hex text, pixel_count integer, undo_of_operation_id uuid, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not collab_v1.is_active_member(p_room_id) then raise exception 'not_active_member'; end if;
  return query select op.revision, op.operation_id, op.actor_user_id, op.actor_client_id, op.kind::text, op.structure_epoch, op.codec_version, encode(op.payload, 'base64'), encode(op.payload_sha256, 'hex'), op.pixel_count, op.undo_of_operation_id, op.created_at
  from collab_v1.operations as op where op.room_id = p_room_id and op.revision > greatest(0, coalesce(p_after_revision, 0)) order by op.revision asc limit least(greatest(coalesce(p_limit, 250), 1), 500);
end $$;

create or replace function public.pixisync_commit_operation(
  p_room_id uuid, p_operation_id uuid, p_client_id uuid, p_kind text, p_structure_epoch bigint,
  p_codec_version smallint, p_payload bytea, p_payload_sha256 bytea, p_pixel_count integer, p_undo_of_operation_id uuid default null
) returns table (commit_status text, revision bigint, payload_sha256_hex text)
language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_room collab_v1.rooms%rowtype; v_role collab_v1.member_role; v_existing collab_v1.operations%rowtype; v_digest bytea;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select * into v_room from collab_v1.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'active' then raise exception 'room_not_active'; end if;
  select role into v_role from collab_v1.room_members where room_id = p_room_id and user_id = v_user_id and revoked_at is null;
  if v_role not in ('owner', 'editor') then raise exception 'not_editor'; end if;
  select * into v_existing from collab_v1.operations where room_id = p_room_id and operation_id = p_operation_id;
  if found then
    if v_existing.actor_user_id <> v_user_id then raise exception 'operation_id_owned_by_another_actor'; end if;
    return query select 'duplicate'::text, v_existing.revision, encode(v_existing.payload_sha256, 'hex'); return;
  end if;
  if p_kind not in ('pixel_patch', 'undo_pixel_patch', 'redo_pixel_patch') or p_codec_version <> 1 or p_structure_epoch <> v_room.structure_epoch or octet_length(p_payload) not between 7 and 49152 or p_pixel_count not between 1 and 8192 or octet_length(p_payload_sha256) <> 32 then raise exception 'invalid_operation_shape'; end if;
  if get_byte(p_payload, 0) <> 80 or get_byte(p_payload, 1) <> 105 or get_byte(p_payload, 2) <> 88 or get_byte(p_payload, 3) <> 83 or get_byte(p_payload, 4) <> 1 or get_byte(p_payload, 5) <> 0 then raise exception 'invalid_codec_header'; end if;
  v_digest := extensions.digest(p_payload, 'sha256');
  if v_digest <> p_payload_sha256 then raise exception 'payload_hash_mismatch'; end if;
  if p_kind in ('undo_pixel_patch', 'redo_pixel_patch') and not exists (select 1 from collab_v1.operations as source where source.room_id = p_room_id and source.operation_id = p_undo_of_operation_id and source.actor_user_id = v_user_id) then raise exception 'undo_target_not_owned'; end if;
  insert into collab_v1.operations (room_id, revision, operation_id, actor_user_id, actor_client_id, kind, structure_epoch, codec_version, payload, payload_sha256, pixel_count, undo_of_operation_id)
  values (p_room_id, v_room.head_revision + 1, p_operation_id, v_user_id, p_client_id, p_kind::collab_v1.operation_kind, v_room.structure_epoch, p_codec_version, p_payload, v_digest, p_pixel_count, p_undo_of_operation_id);
  update collab_v1.rooms set head_revision = v_room.head_revision + 1, updated_at = timezone('utc', now()) where id = p_room_id;
  return query select 'committed'::text, v_room.head_revision + 1, encode(v_digest, 'hex');
end $$;

revoke all on function public.pixisync_create_room(text) from public, anon;
revoke all on function public.pixisync_get_ops_since(uuid, bigint, integer) from public, anon;
revoke all on function public.pixisync_commit_operation(uuid, uuid, uuid, text, bigint, smallint, bytea, bytea, integer, uuid) from public, anon;
grant execute on function public.pixisync_create_room(text) to authenticated;
grant execute on function public.pixisync_get_ops_since(uuid, bigint, integer) to authenticated;
grant execute on function public.pixisync_commit_operation(uuid, uuid, uuid, text, bigint, smallint, bytea, bytea, integer, uuid) to authenticated;
