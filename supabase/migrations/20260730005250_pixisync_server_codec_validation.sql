-- Validate the complete canonical PiXS V1 payload at the authority boundary.
create or replace function collab_v1.validate_pixel_patch(p_payload bytea, p_cell_count bigint)
returns integer
language plpgsql immutable set search_path = '' as $$
declare v_length integer := octet_length(p_payload); v_offset integer := 6; v_count bigint := 0; v_value bigint; v_shift integer; v_bytes integer; v_byte integer; v_index bigint := -1; v_delta bigint; v_i integer; v_color integer;
begin
  if p_cell_count < 1 or p_payload is null or v_length < 7 or v_length > 49152 then raise exception 'invalid_pixel_patch'; end if;
  if get_byte(p_payload, 0) <> 80 or get_byte(p_payload, 1) <> 105 or get_byte(p_payload, 2) <> 88 or get_byte(p_payload, 3) <> 83 or get_byte(p_payload, 4) <> 1 or get_byte(p_payload, 5) <> 0 then raise exception 'invalid_pixel_patch_header'; end if;
  -- count varuint: max five bytes, minimal encoding only.
  v_value := 0; v_shift := 0; v_bytes := 0;
  loop
    if v_offset >= v_length or v_bytes >= 5 then raise exception 'invalid_pixel_patch_varuint'; end if;
    v_byte := get_byte(p_payload, v_offset); v_offset := v_offset + 1; v_value := v_value + ((v_byte & 127)::bigint << v_shift); v_shift := v_shift + 7; v_bytes := v_bytes + 1;
    exit when (v_byte & 128) = 0;
  end loop;
  if v_bytes > 1 and v_value < (1::bigint << (7 * (v_bytes - 1))) then raise exception 'noncanonical_pixel_patch_varuint'; end if;
  if v_value not between 1 and 8192 then raise exception 'invalid_pixel_patch_count'; end if;
  v_count := v_value;
  for v_i in 1..v_count loop
    v_value := 0; v_shift := 0; v_bytes := 0;
    loop
      if v_offset >= v_length or v_bytes >= 5 then raise exception 'invalid_pixel_patch_varuint'; end if;
      v_byte := get_byte(p_payload, v_offset); v_offset := v_offset + 1; v_value := v_value + ((v_byte & 127)::bigint << v_shift); v_shift := v_shift + 7; v_bytes := v_bytes + 1;
      exit when (v_byte & 128) = 0;
    end loop;
    if v_bytes > 1 and v_value < (1::bigint << (7 * (v_bytes - 1))) then raise exception 'noncanonical_pixel_patch_varuint'; end if;
    v_delta := v_value;
    if (v_i > 1 and v_delta = 0) then raise exception 'nonascending_pixel_patch_index'; end if;
    v_index := case when v_i = 1 then v_delta else v_index + v_delta end;
    if v_index < 0 or v_index >= p_cell_count then raise exception 'pixel_patch_index_out_of_range'; end if;
    if v_offset >= v_length then raise exception 'truncated_pixel_patch'; end if;
    v_color := get_byte(p_payload, v_offset); v_offset := v_offset + 1;
    if v_color > 254 then raise exception 'pixel_patch_palette_out_of_range'; end if;
  end loop;
  if v_offset <> v_length then raise exception 'pixel_patch_trailing_bytes'; end if;
  return v_count::integer;
end $$;
revoke all on function collab_v1.validate_pixel_patch(bytea, bigint) from public, anon, authenticated;

create or replace function public.pixisync_commit_operation(
  p_room_id uuid, p_operation_id uuid, p_client_id uuid, p_kind text, p_structure_epoch bigint, p_codec_version smallint,
  p_canvas_id text, p_frame_id text, p_layer_id text, p_canvas_width integer, p_canvas_height integer,
  p_payload bytea, p_payload_sha256 bytea, p_pixel_count integer, p_undo_of_operation_id uuid default null
) returns table (commit_status text, revision bigint, payload_sha256_hex text)
language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_room collab_v1.rooms%rowtype; v_role collab_v1.member_role; v_existing collab_v1.operations%rowtype; v_digest bytea; v_decoded_count integer;
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
  if p_kind not in ('pixel_patch', 'undo_pixel_patch', 'redo_pixel_patch') or p_codec_version <> 1 or p_structure_epoch <> v_room.structure_epoch or octet_length(p_payload) not between 7 and 49152 or p_pixel_count not between 1 and 8192 or octet_length(p_payload_sha256) <> 32 or char_length(coalesce(p_canvas_id, '')) not between 1 and 128 or char_length(coalesce(p_frame_id, '')) not between 1 and 128 or char_length(coalesce(p_layer_id, '')) not between 1 and 128 or p_canvas_width not between 1 and 16384 or p_canvas_height not between 1 and 16384 or p_canvas_width::bigint * p_canvas_height::bigint > 268435456 then raise exception 'invalid_operation_shape'; end if;
  v_decoded_count := collab_v1.validate_pixel_patch(p_payload, p_canvas_width::bigint * p_canvas_height::bigint);
  if v_decoded_count <> p_pixel_count then raise exception 'pixel_count_mismatch'; end if;
  v_digest := extensions.digest(p_payload, 'sha256');
  if v_digest <> p_payload_sha256 then raise exception 'payload_hash_mismatch'; end if;
  if p_kind in ('undo_pixel_patch', 'redo_pixel_patch') and not exists (select 1 from collab_v1.operations as source where source.room_id = p_room_id and source.operation_id = p_undo_of_operation_id and source.actor_user_id = v_user_id) then raise exception 'undo_target_not_owned'; end if;
  insert into collab_v1.operations (room_id, revision, operation_id, actor_user_id, actor_client_id, kind, structure_epoch, codec_version, canvas_id, frame_id, layer_id, canvas_width, canvas_height, payload, payload_sha256, pixel_count, undo_of_operation_id)
  values (p_room_id, v_room.head_revision + 1, p_operation_id, v_user_id, p_client_id, p_kind::collab_v1.operation_kind, v_room.structure_epoch, p_codec_version, p_canvas_id, p_frame_id, p_layer_id, p_canvas_width, p_canvas_height, p_payload, v_digest, p_pixel_count, p_undo_of_operation_id);
  update collab_v1.rooms set head_revision = v_room.head_revision + 1, updated_at = timezone('utc', now()) where id = p_room_id;
  return query select 'committed'::text, v_room.head_revision + 1, encode(v_digest, 'hex');
end $$;
