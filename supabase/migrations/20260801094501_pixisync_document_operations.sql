-- Canonical non-raster document changes share the same ordered revision log as
-- pixel patches. Raster planes are deliberately excluded and continue through
-- bounded pixel_patch chunks after a structure operation is confirmed.

alter table collab_v1.operations
  drop constraint if exists operations_payload_check,
  drop constraint if exists operations_codec_version_check,
  drop constraint if exists pixisync_operations_actual_pixel_count_check,
  drop constraint if exists pixisync_operations_empty_guard_only_check,
  drop constraint if exists pixisync_operations_requested_pixel_count_check,
  drop constraint if exists pixisync_operations_skipped_pixel_count_check;

alter table collab_v1.operations
  add constraint pixisync_operations_payload_by_kind_check check (
    (kind = 'document_patch' and octet_length(payload) between 2 and 262144)
    or (kind <> 'document_patch' and octet_length(payload) between 7 and 49152)
  ),
  add constraint pixisync_operations_codec_by_kind_check check (
    (kind = 'document_patch' and codec_version = 2)
    or (kind <> 'document_patch' and codec_version = 1)
  ),
  add constraint pixisync_operations_actual_pixel_count_check check (
    (kind = 'document_patch' and pixel_count = 0)
    or (kind <> 'document_patch' and pixel_count between 0 and 8192)
  ),
  add constraint pixisync_operations_empty_guard_only_check check (
    pixel_count > 0 or kind in ('undo_pixel_patch', 'redo_pixel_patch', 'document_patch')
  ),
  add constraint pixisync_operations_requested_pixel_count_check check (
    (kind = 'document_patch' and requested_pixel_count = 0)
    or (kind <> 'document_patch' and requested_pixel_count between 1 and 8192)
  ),
  add constraint pixisync_operations_skipped_pixel_count_check check (
    skipped_pixel_count = requested_pixel_count - pixel_count
  );

create or replace function collab_v1.validate_document_operation(p_document jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_type text;
  v_item jsonb;
  v_frame jsonb;
  v_layer jsonb;
  v_color jsonb;
  v_key text;
  v_seen_ids text[] := array[]::text[];
begin
  if jsonb_typeof(p_document) <> 'object' or p_document->>'version' <> '1' then
    raise exception 'invalid_document_operation_envelope';
  end if;
  v_type := p_document->>'type';
  if v_type not in ('document_structure', 'palette', 'layer_properties', 'frame_properties', 'checkpoint_restore') then
    raise exception 'unsupported_document_operation_type';
  end if;
  for v_key in select jsonb_object_keys(p_document) loop
    if not v_key = any(case v_type
      when 'document_structure' then array['version', 'type', 'document']
      when 'palette' then array['version', 'type', 'palette']
      when 'layer_properties' then array['version', 'type', 'layers']
      when 'frame_properties' then array['version', 'type', 'frames']
      else array['version', 'type', 'objectPath', 'sha256Hex', 'byteLength'] end) then
      raise exception 'unknown_document_operation_key';
    end if;
  end loop;

  if v_type = 'checkpoint_restore' then
    if (select count(*) from jsonb_object_keys(p_document)) <> 5
       or jsonb_typeof(p_document->'objectPath') <> 'string'
       or jsonb_typeof(p_document->'sha256Hex') <> 'string'
       or jsonb_typeof(p_document->'byteLength') <> 'number'
       or p_document->>'objectPath' !~ '^rooms/[0-9a-f-]{36}/document-checkpoints/[0-9a-f-]{36}\.pxd$'
       or p_document->>'sha256Hex' !~ '^[0-9a-f]{64}$'
       or (p_document->>'byteLength')::numeric <> trunc((p_document->>'byteLength')::numeric)
       or (p_document->>'byteLength')::integer not between 1 and 52428800 then
      raise exception 'invalid_document_checkpoint_reference';
    end if;
  elsif v_type in ('document_structure', 'palette') then
    if jsonb_typeof(case when v_type = 'palette' then p_document->'palette' else p_document->'document'->'palette' end) <> 'array'
       or jsonb_array_length(case when v_type = 'palette' then p_document->'palette' else p_document->'document'->'palette' end) not between 1 and 255 then
      raise exception 'invalid_document_palette';
    end if;
    for v_color in select value from jsonb_array_elements(case when v_type = 'palette' then p_document->'palette' else p_document->'document'->'palette' end) loop
      if jsonb_typeof(v_color) <> 'object'
         or (select count(*) from jsonb_object_keys(v_color)) <> 4
         or not (v_color ?& array['r','g','b','a'])
         or jsonb_typeof(v_color->'r') <> 'number'
         or jsonb_typeof(v_color->'g') <> 'number'
         or jsonb_typeof(v_color->'b') <> 'number'
         or jsonb_typeof(v_color->'a') <> 'number'
         or (v_color->>'r')::numeric <> trunc((v_color->>'r')::numeric)
         or (v_color->>'g')::numeric <> trunc((v_color->>'g')::numeric)
         or (v_color->>'b')::numeric <> trunc((v_color->>'b')::numeric)
         or (v_color->>'a')::numeric <> trunc((v_color->>'a')::numeric)
         or (v_color->>'r')::integer not between 0 and 255
         or (v_color->>'g')::integer not between 0 and 255
         or (v_color->>'b')::integer not between 0 and 255
         or (v_color->>'a')::integer not between 0 and 255 then
        raise exception 'invalid_document_color';
      end if;
    end loop;
  end if;

  if v_type = 'document_structure' then
    if jsonb_typeof(p_document->'document') <> 'object'
       or (select bool_and(key = any(array['palette','canvases'])) from jsonb_object_keys(p_document->'document') key) is not true
       or not (p_document->'document' ?& array['palette','canvases'])
       or (select count(*) from jsonb_object_keys(p_document->'document')) <> 2
       or jsonb_typeof(p_document->'document'->'canvases') <> 'array'
       or jsonb_array_length(p_document->'document'->'canvases') not between 1 and 64 then
      raise exception 'invalid_document_structure';
    end if;
    for v_item in select value from jsonb_array_elements(p_document->'document'->'canvases') loop
      if jsonb_typeof(v_item) <> 'object'
         or (select bool_and(key = any(array['id','name','width','height','frames'])) from jsonb_object_keys(v_item) key) is not true
         or not (v_item ?& array['id','name','width','height','frames'])
         or (select count(*) from jsonb_object_keys(v_item)) <> 5
         or jsonb_typeof(v_item->'id') <> 'string'
         or jsonb_typeof(v_item->'name') <> 'string'
         or jsonb_typeof(v_item->'width') <> 'number'
         or jsonb_typeof(v_item->'height') <> 'number'
         or (v_item->>'width')::numeric <> trunc((v_item->>'width')::numeric)
         or (v_item->>'height')::numeric <> trunc((v_item->>'height')::numeric)
         or char_length(coalesce(v_item->>'id','')) not between 1 and 128
         or char_length(coalesce(v_item->>'name','')) > 120
         or (v_item->>'width')::integer not between 1 and 16384
         or (v_item->>'height')::integer not between 1 and 16384
         or (v_item->>'width')::bigint * (v_item->>'height')::bigint > 268435456
         or jsonb_typeof(v_item->'frames') <> 'array'
         or jsonb_array_length(v_item->'frames') not between 1 and 4096 then
        raise exception 'invalid_document_canvas';
      end if;
      if v_item->>'id' = any(v_seen_ids) then raise exception 'duplicate_document_id'; end if;
      v_seen_ids := array_append(v_seen_ids, v_item->>'id');
      for v_frame in select value from jsonb_array_elements(v_item->'frames') loop
        if jsonb_typeof(v_frame) <> 'object'
           or (select bool_and(key = any(array['id','name','duration','layers'])) from jsonb_object_keys(v_frame) key) is not true
           or not (v_frame ?& array['id','name','duration','layers'])
           or jsonb_typeof(v_frame->'id') <> 'string'
           or jsonb_typeof(v_frame->'name') <> 'string'
           or jsonb_typeof(v_frame->'duration') <> 'number'
           or char_length(coalesce(v_frame->>'id','')) not between 1 and 128
           or char_length(coalesce(v_frame->>'name','')) > 120
           or (v_frame->>'duration')::numeric not between 1 and 655350
           or jsonb_typeof(v_frame->'layers') <> 'array'
           or jsonb_array_length(v_frame->'layers') not between 1 and 4096 then
          raise exception 'invalid_document_frame';
        end if;
        if v_frame->>'id' = any(v_seen_ids) then raise exception 'duplicate_document_id'; end if;
        v_seen_ids := array_append(v_seen_ids, v_frame->>'id');
        for v_layer in select value from jsonb_array_elements(v_frame->'layers') loop
          if jsonb_typeof(v_layer) <> 'object'
             or (select bool_and(key = any(array['id','trackId','name','opacity','blendMode'])) from jsonb_object_keys(v_layer) key) is not true
             or not (v_layer ?& array['id','trackId','name','opacity','blendMode'])
             or (select count(*) from jsonb_object_keys(v_layer)) <> 5
             or jsonb_typeof(v_layer->'id') <> 'string'
             or jsonb_typeof(v_layer->'trackId') <> 'string'
             or jsonb_typeof(v_layer->'name') <> 'string'
             or jsonb_typeof(v_layer->'opacity') <> 'number'
             or jsonb_typeof(v_layer->'blendMode') <> 'string'
             or char_length(coalesce(v_layer->>'id','')) not between 1 and 128
             or char_length(coalesce(v_layer->>'trackId','')) not between 1 and 128
             or char_length(coalesce(v_layer->>'name','')) > 120
             or (v_layer->>'opacity')::numeric not between 0 and 1
             or char_length(coalesce(v_layer->>'blendMode','')) not between 1 and 32 then
            raise exception 'invalid_document_layer';
          end if;
          if v_layer->>'id' = any(v_seen_ids) then raise exception 'duplicate_document_id'; end if;
          v_seen_ids := array_append(v_seen_ids, v_layer->>'id');
        end loop;
      end loop;
    end loop;
  elsif v_type = 'layer_properties' then
    if jsonb_typeof(p_document->'layers') <> 'array' or jsonb_array_length(p_document->'layers') not between 1 and 262144 then
      raise exception 'invalid_layer_properties';
    end if;
    for v_layer in select value from jsonb_array_elements(p_document->'layers') loop
      if jsonb_typeof(v_layer) <> 'object'
         or (select bool_and(key = any(array['layerId','opacity','blendMode'])) from jsonb_object_keys(v_layer) key) is not true
         or jsonb_typeof(v_layer->'layerId') <> 'string'
         or (v_layer ? 'opacity' and jsonb_typeof(v_layer->'opacity') <> 'number')
         or (v_layer ? 'blendMode' and jsonb_typeof(v_layer->'blendMode') <> 'string')
         or char_length(coalesce(v_layer->>'layerId','')) not between 1 and 128
         or (not (v_layer ? 'opacity') and not (v_layer ? 'blendMode'))
         or (v_layer ? 'opacity' and (v_layer->>'opacity')::numeric not between 0 and 1)
         or (v_layer ? 'blendMode' and char_length(v_layer->>'blendMode') not between 1 and 32) then
        raise exception 'invalid_layer_properties';
      end if;
      if v_layer->>'layerId' = any(v_seen_ids) then raise exception 'duplicate_document_id'; end if;
      v_seen_ids := array_append(v_seen_ids, v_layer->>'layerId');
    end loop;
  elsif v_type = 'frame_properties' then
    if jsonb_typeof(p_document->'frames') <> 'array' or jsonb_array_length(p_document->'frames') not between 1 and 262144 then
      raise exception 'invalid_frame_properties';
    end if;
    for v_frame in select value from jsonb_array_elements(p_document->'frames') loop
      if jsonb_typeof(v_frame) <> 'object'
         or (select bool_and(key = any(array['frameId','duration'])) from jsonb_object_keys(v_frame) key) is not true
         or jsonb_typeof(v_frame->'frameId') <> 'string'
         or jsonb_typeof(v_frame->'duration') <> 'number'
         or (select count(*) from jsonb_object_keys(v_frame)) <> 2
         or char_length(coalesce(v_frame->>'frameId','')) not between 1 and 128
         or (v_frame->>'duration')::numeric not between 1 and 655350 then
        raise exception 'invalid_frame_properties';
      end if;
      if v_frame->>'frameId' = any(v_seen_ids) then raise exception 'duplicate_document_id'; end if;
      v_seen_ids := array_append(v_seen_ids, v_frame->>'frameId');
    end loop;
  end if;
  return v_type;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'invalid_document_operation_value';
end
$$;

revoke all on function collab_v1.validate_document_operation(jsonb) from public, anon, authenticated;

create or replace function public.pixisync_commit_document_operation(
  p_room_id uuid,
  p_operation_id uuid,
  p_client_id uuid,
  p_base_revision bigint,
  p_structure_epoch bigint,
  p_payload bytea,
  p_payload_sha256 bytea
)
returns table (
  commit_status text,
  revision bigint,
  structure_epoch bigint,
  payload_b64 text,
  payload_sha256_hex text,
  pixel_count integer,
  requested_pixel_count integer,
  skipped_pixel_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room collab_v1.rooms%rowtype;
  v_role collab_v1.member_role;
  v_existing collab_v1.operations%rowtype;
  v_digest bytea;
  v_document jsonb;
  v_type text;
  v_next_revision bigint;
  v_next_epoch bigint;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_operation_id is null or p_client_id is null
     or p_base_revision < 0 or p_structure_epoch < 0
     or octet_length(p_payload) not between 2 and 262144
     or octet_length(p_payload_sha256) <> 32 then
    raise exception 'invalid_document_operation_shape';
  end if;

  select * into v_room from collab_v1.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'active' then raise exception 'room_not_active'; end if;
  select role into v_role from collab_v1.room_members
  where room_id = p_room_id and user_id = v_user_id and revoked_at is null;
  if v_role not in ('owner', 'editor') then raise exception 'not_editor'; end if;

  v_digest := extensions.digest(p_payload, 'sha256');
  if v_digest <> p_payload_sha256 then raise exception 'payload_hash_mismatch'; end if;
  begin
    v_document := convert_from(p_payload, 'utf8')::jsonb;
    v_type := collab_v1.validate_document_operation(v_document);
  exception when others then
    raise exception 'invalid_document_operation_json';
  end;

  select * into v_existing from collab_v1.operations
  where room_id = p_room_id and operation_id = p_operation_id;
  if found then
    if v_existing.actor_user_id <> v_user_id
       or v_existing.actor_client_id <> p_client_id
       or v_existing.kind <> 'document_patch'
       or v_existing.codec_version <> 2
       or v_existing.pixel_count <> 0
       or v_existing.requested_pixel_count <> 0
       or v_existing.payload_sha256 <> v_digest then
      raise exception 'operation_id_conflict';
    end if;
    return query select 'duplicate'::text, v_existing.revision,
      v_existing.structure_epoch, encode(v_existing.payload, 'base64'),
      encode(v_existing.payload_sha256, 'hex'), v_existing.pixel_count,
      v_existing.requested_pixel_count, v_existing.skipped_pixel_count;
    return;
  end if;

  -- A semantic document operation is accepted only against the exact ordered
  -- head. Incrementing the epoch invalidates pixel commits captured against the
  -- old structure/palette and forces them through normal recovery.
  if p_base_revision <> v_room.head_revision then raise exception 'stale_base_revision'; end if;
  if p_structure_epoch <> v_room.structure_epoch then raise exception 'stale_structure_epoch'; end if;
  if v_room.head_revision >= 9223372036854775806
     or v_room.structure_epoch >= 9223372036854775806 then
    raise exception 'revision_limit_reached';
  end if;
  v_next_revision := v_room.head_revision + 1;
  v_next_epoch := v_room.structure_epoch + 1;

  insert into collab_v1.operations (
    room_id, revision, operation_id, actor_user_id, actor_client_id, kind,
    structure_epoch, codec_version, canvas_id, frame_id, layer_id,
    canvas_width, canvas_height, payload, payload_sha256, pixel_count,
    requested_pixel_count, skipped_pixel_count, request_payload_sha256,
    undo_of_operation_id
  ) values (
    p_room_id, v_next_revision, p_operation_id, v_user_id, p_client_id,
    'document_patch', v_next_epoch, 2, '__document__', '__document__',
    '__document__', 1, 1, p_payload, v_digest, 0, 0, 0, v_digest, null
  );
  update collab_v1.rooms
  set head_revision = v_next_revision,
      structure_epoch = v_next_epoch,
      updated_at = timezone('utc', now())
  where id = p_room_id;

  return query select 'committed'::text, v_next_revision, v_next_epoch,
    encode(p_payload, 'base64'), encode(v_digest, 'hex'), 0, 0, 0;
end
$$;

revoke all on function public.pixisync_commit_document_operation(
  uuid, uuid, uuid, bigint, bigint, bytea, bytea
) from public, anon;
grant execute on function public.pixisync_commit_document_operation(
  uuid, uuid, uuid, bigint, bigint, bytea, bytea
) to authenticated;
