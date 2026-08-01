-- Keep the existing canonical operation validator for previously published
-- codecs, and add a tightly-scoped validator for the small structural intent
-- records introduced by PiXiSYNC v1.  The commit RPC keeps its exact-head and
-- structure-epoch checks; this migration changes payload shape only.
alter function collab_v1.validate_document_operation(jsonb)
  rename to validate_document_operation_v1;

create or replace function collab_v1.validate_structure_delta(p_document jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_action text := p_document->>'action';
  v_data jsonb := p_document->'data';
  v_item jsonb;
  v_layer jsonb;
  v_key text;
begin
  if jsonb_typeof(p_document) <> 'object'
     or p_document->>'version' <> '1'
     or p_document->>'type' <> 'structure_delta'
     or v_action not in ('layer_track_insert', 'layer_track_remove', 'layer_track_clone', 'frame_insert', 'frame_remove', 'raster_restore', 'canvas_resize_restore', 'frame_clone', 'canvas_resize', 'frame_order', 'layer_order')
     or jsonb_typeof(v_data) <> 'object' then
    raise exception 'invalid_structure_delta';
  end if;
  for v_key in select jsonb_object_keys(p_document) loop
    if v_key not in ('version', 'type', 'action', 'data') then
      raise exception 'unknown_structure_delta_key';
    end if;
  end loop;
  if jsonb_typeof(v_data->'canvasId') <> 'string'
     or char_length(v_data->>'canvasId') not between 1 and 128 then
    raise exception 'invalid_structure_delta_canvas';
  end if;

  if v_action = 'layer_track_insert' then
    if (select count(*) from jsonb_object_keys(v_data)) <> 3
       or not (v_data ?& array['canvasId','afterTrackId','cells'])
       or (v_data->'afterTrackId' <> 'null'::jsonb and (jsonb_typeof(v_data->'afterTrackId') <> 'string' or char_length(v_data->>'afterTrackId') not between 1 and 128))
       or jsonb_typeof(v_data->'cells') <> 'array'
       or jsonb_array_length(v_data->'cells') not between 1 and 4096 then
      raise exception 'invalid_layer_track_insert';
    end if;
    if (select count(distinct value->>'frameId') from jsonb_array_elements(v_data->'cells')) <> jsonb_array_length(v_data->'cells')
       or (select count(distinct value->'layer'->>'id') from jsonb_array_elements(v_data->'cells')) <> jsonb_array_length(v_data->'cells')
       or (select count(distinct value->'layer'->>'trackId') from jsonb_array_elements(v_data->'cells')) <> 1 then
      raise exception 'inconsistent_layer_track_cells';
    end if;
    for v_item in select value from jsonb_array_elements(v_data->'cells') loop
      v_layer := v_item->'layer';
      if jsonb_typeof(v_item) <> 'object' or (select count(*) from jsonb_object_keys(v_item)) <> 2
         or not (v_item ?& array['frameId','layer'])
         or jsonb_typeof(v_item->'frameId') <> 'string' or char_length(v_item->>'frameId') not between 1 and 128
         or jsonb_typeof(v_layer) <> 'object' or (select count(*) from jsonb_object_keys(v_layer)) <> 5
         or not (v_layer ?& array['id','trackId','name','opacity','blendMode'])
         or jsonb_typeof(v_layer->'id') <> 'string' or char_length(v_layer->>'id') not between 1 and 128
         or jsonb_typeof(v_layer->'trackId') <> 'string' or char_length(v_layer->>'trackId') not between 1 and 128
         or jsonb_typeof(v_layer->'name') <> 'string' or char_length(v_layer->>'name') > 120
         or jsonb_typeof(v_layer->'opacity') <> 'number' or (v_layer->>'opacity')::numeric not between 0 and 1
         or jsonb_typeof(v_layer->'blendMode') <> 'string' or char_length(v_layer->>'blendMode') not between 1 and 32 then
        raise exception 'invalid_layer_track_cell';
      end if;
    end loop;
  elsif v_action = 'layer_track_remove' then
    if (select count(*) from jsonb_object_keys(v_data)) <> 3 or not (v_data ?& array['canvasId','trackIds','inverseAsset'])
       or jsonb_typeof(v_data->'trackIds') <> 'array' or jsonb_array_length(v_data->'trackIds') not between 1 and 1024
       or (select count(distinct value #>> '{}') from jsonb_array_elements(v_data->'trackIds')) <> jsonb_array_length(v_data->'trackIds')
       or jsonb_typeof(v_data->'inverseAsset') <> 'object' or (select count(*) from jsonb_object_keys(v_data->'inverseAsset')) <> 4
       or not (v_data->'inverseAsset' ?& array['objectPath','sha256Hex','byteLength','codecVersion'])
       or jsonb_typeof(v_data->'inverseAsset'->'objectPath') <> 'string'
       or v_data->'inverseAsset'->>'objectPath' !~ '^rooms/[0-9a-f-]{36}/document-checkpoints/[0-9a-f-]{36}\.pxd$'
       or jsonb_typeof(v_data->'inverseAsset'->'sha256Hex') <> 'string' or v_data->'inverseAsset'->>'sha256Hex' !~ '^[0-9a-f]{64}$'
       or jsonb_typeof(v_data->'inverseAsset'->'byteLength') <> 'number' or (v_data->'inverseAsset'->>'byteLength')::integer not between 1 and 52428800
       or (v_data->'inverseAsset'->>'codecVersion')::integer <> 1 then
      raise exception 'invalid_layer_track_remove';
    end if;
    for v_item in select value from jsonb_array_elements(v_data->'trackIds') loop
      if jsonb_typeof(v_item) <> 'string' or char_length(v_item #>> '{}') not between 1 and 128 then
        raise exception 'invalid_layer_track_remove';
      end if;
    end loop;
  elsif v_action = 'layer_track_clone' then
    if (select count(*) from jsonb_object_keys(v_data)) <> 3 or not (v_data ?& array['canvasId','afterTrackId','clones'])
       or (v_data->'afterTrackId' <> 'null'::jsonb and (jsonb_typeof(v_data->'afterTrackId') <> 'string' or char_length(v_data->>'afterTrackId') not between 1 and 128))
       or jsonb_typeof(v_data->'clones') <> 'array' or jsonb_array_length(v_data->'clones') not between 1 and 1024 then
      raise exception 'invalid_layer_track_clone';
    end if;
    for v_item in select value from jsonb_array_elements(v_data->'clones') loop
      if jsonb_typeof(v_item) <> 'object' or (select count(*) from jsonb_object_keys(v_item)) <> 3
         or not (v_item ?& array['sourceTrackId','trackId','cells'])
         or jsonb_typeof(v_item->'sourceTrackId') <> 'string' or char_length(v_item->>'sourceTrackId') not between 1 and 128
         or jsonb_typeof(v_item->'trackId') <> 'string' or char_length(v_item->>'trackId') not between 1 and 128
         or v_item->>'sourceTrackId' = v_item->>'trackId'
         or jsonb_typeof(v_item->'cells') <> 'array' or jsonb_array_length(v_item->'cells') not between 1 and 4096
         or (select count(distinct value->>'frameId') from jsonb_array_elements(v_item->'cells')) <> jsonb_array_length(v_item->'cells')
         or (select count(distinct value->>'layerId') from jsonb_array_elements(v_item->'cells')) <> jsonb_array_length(v_item->'cells') then
        raise exception 'invalid_layer_track_clone';
      end if;
      for v_layer in select value from jsonb_array_elements(v_item->'cells') loop
        if jsonb_typeof(v_layer) <> 'object' or (select count(*) from jsonb_object_keys(v_layer)) <> 2
           or not (v_layer ?& array['frameId','layerId'])
           or jsonb_typeof(v_layer->'frameId') <> 'string' or char_length(v_layer->>'frameId') not between 1 and 128
           or jsonb_typeof(v_layer->'layerId') <> 'string' or char_length(v_layer->>'layerId') not between 1 and 128 then raise exception 'invalid_layer_track_clone_cell'; end if;
      end loop;
    end loop;
  elsif v_action = 'frame_insert' then
    if (select count(*) from jsonb_object_keys(v_data)) <> 3 or not (v_data ?& array['canvasId','afterFrameId','frame'])
       or (v_data->'afterFrameId' <> 'null'::jsonb and (jsonb_typeof(v_data->'afterFrameId') <> 'string' or char_length(v_data->>'afterFrameId') not between 1 and 128))
       or jsonb_typeof(v_data->'frame') <> 'object' or (select count(*) from jsonb_object_keys(v_data->'frame')) <> 4
       or not (v_data->'frame' ?& array['id','name','duration','layers'])
       or jsonb_typeof(v_data->'frame'->'id') <> 'string' or char_length(v_data->'frame'->>'id') not between 1 and 128
       or jsonb_typeof(v_data->'frame'->'name') <> 'string' or char_length(v_data->'frame'->>'name') > 120
       or jsonb_typeof(v_data->'frame'->'duration') <> 'number' or (v_data->'frame'->>'duration')::numeric <> trunc((v_data->'frame'->>'duration')::numeric)
       or (v_data->'frame'->>'duration')::integer not between 1 and 655350
       or jsonb_typeof(v_data->'frame'->'layers') <> 'array' or jsonb_array_length(v_data->'frame'->'layers') not between 1 and 4096 then
      raise exception 'invalid_frame_insert';
    end if;
    for v_layer in select value from jsonb_array_elements(v_data->'frame'->'layers') loop
      if jsonb_typeof(v_layer) <> 'object' or (select count(*) from jsonb_object_keys(v_layer)) <> 5
         or not (v_layer ?& array['id','trackId','name','opacity','blendMode'])
         or jsonb_typeof(v_layer->'id') <> 'string' or char_length(v_layer->>'id') not between 1 and 128
         or jsonb_typeof(v_layer->'trackId') <> 'string' or char_length(v_layer->>'trackId') not between 1 and 128
         or jsonb_typeof(v_layer->'name') <> 'string' or char_length(v_layer->>'name') > 120
         or jsonb_typeof(v_layer->'opacity') <> 'number' or (v_layer->>'opacity')::numeric not between 0 and 1
         or jsonb_typeof(v_layer->'blendMode') <> 'string' or char_length(v_layer->>'blendMode') not between 1 and 32 then
        raise exception 'invalid_frame_insert_layer';
      end if;
    end loop;
  elsif v_action = 'frame_remove' then
    if (select count(*) from jsonb_object_keys(v_data)) <> 3 or not (v_data ?& array['canvasId','frameIds','inverseAsset'])
       or jsonb_typeof(v_data->'frameIds') <> 'array' or jsonb_array_length(v_data->'frameIds') not between 1 and 1024
       or (select count(distinct value #>> '{}') from jsonb_array_elements(v_data->'frameIds')) <> jsonb_array_length(v_data->'frameIds')
       or jsonb_typeof(v_data->'inverseAsset') <> 'object' or (select count(*) from jsonb_object_keys(v_data->'inverseAsset')) <> 4
       or not (v_data->'inverseAsset' ?& array['objectPath','sha256Hex','byteLength','codecVersion'])
       or jsonb_typeof(v_data->'inverseAsset'->'objectPath') <> 'string'
       or v_data->'inverseAsset'->>'objectPath' !~ '^rooms/[0-9a-f-]{36}/document-checkpoints/[0-9a-f-]{36}\.pxd$'
       or jsonb_typeof(v_data->'inverseAsset'->'sha256Hex') <> 'string' or v_data->'inverseAsset'->>'sha256Hex' !~ '^[0-9a-f]{64}$'
       or jsonb_typeof(v_data->'inverseAsset'->'byteLength') <> 'number' or (v_data->'inverseAsset'->>'byteLength')::integer not between 1 and 52428800
       or (v_data->'inverseAsset'->>'codecVersion')::integer <> 1 then
      raise exception 'invalid_frame_remove';
    end if;
    for v_item in select value from jsonb_array_elements(v_data->'frameIds') loop
      if jsonb_typeof(v_item) <> 'string' or char_length(v_item #>> '{}') not between 1 and 128 then
        raise exception 'invalid_frame_remove';
      end if;
    end loop;
  elsif v_action = 'raster_restore' then
    if (select count(*) from jsonb_object_keys(v_data)) <> 4 or not (v_data ?& array['canvasId','afterFrameId','afterTrackId','inverseAsset'])
       or (v_data->'afterFrameId' <> 'null'::jsonb and (jsonb_typeof(v_data->'afterFrameId') <> 'string' or char_length(v_data->>'afterFrameId') not between 1 and 128))
       or (v_data->'afterTrackId' <> 'null'::jsonb and (jsonb_typeof(v_data->'afterTrackId') <> 'string' or char_length(v_data->>'afterTrackId') not between 1 and 128))
       or jsonb_typeof(v_data->'inverseAsset') <> 'object' or (select count(*) from jsonb_object_keys(v_data->'inverseAsset')) <> 4
       or not (v_data->'inverseAsset' ?& array['objectPath','sha256Hex','byteLength','codecVersion'])
       or jsonb_typeof(v_data->'inverseAsset'->'objectPath') <> 'string'
       or v_data->'inverseAsset'->>'objectPath' !~ '^rooms/[0-9a-f-]{36}/document-checkpoints/[0-9a-f-]{36}\.pxd$'
       or jsonb_typeof(v_data->'inverseAsset'->'sha256Hex') <> 'string' or v_data->'inverseAsset'->>'sha256Hex' !~ '^[0-9a-f]{64}$'
       or jsonb_typeof(v_data->'inverseAsset'->'byteLength') <> 'number' or (v_data->'inverseAsset'->>'byteLength')::integer not between 1 and 52428800
       or (v_data->'inverseAsset'->>'codecVersion')::integer <> 1 then
      raise exception 'invalid_raster_restore';
    end if;
  elsif v_action = 'canvas_resize_restore' then
    if (select count(*) from jsonb_object_keys(v_data)) <> 8
       or not (v_data ?& array['canvasId','fromWidth','fromHeight','width','height','offsetX','offsetY','inverseAsset'])
       or jsonb_typeof(v_data->'inverseAsset') <> 'object' or (select count(*) from jsonb_object_keys(v_data->'inverseAsset')) <> 4
       or not (v_data->'inverseAsset' ?& array['objectPath','sha256Hex','byteLength','codecVersion'])
       or jsonb_typeof(v_data->'inverseAsset'->'objectPath') <> 'string'
       or v_data->'inverseAsset'->>'objectPath' !~ '^rooms/[0-9a-f-]{36}/document-checkpoints/[0-9a-f-]{36}\.pxd$'
       or jsonb_typeof(v_data->'inverseAsset'->'sha256Hex') <> 'string' or v_data->'inverseAsset'->>'sha256Hex' !~ '^[0-9a-f]{64}$'
       or jsonb_typeof(v_data->'inverseAsset'->'byteLength') <> 'number' or (v_data->'inverseAsset'->>'byteLength')::integer not between 1 and 52428800
       or (v_data->'inverseAsset'->>'codecVersion')::integer <> 1 then
      raise exception 'invalid_canvas_resize_restore';
    end if;
    for v_key in select unnest(array['fromWidth','fromHeight','width','height']) loop
      if jsonb_typeof(v_data->v_key) <> 'number' or (v_data->>v_key)::numeric <> trunc((v_data->>v_key)::numeric)
         or (v_data->>v_key)::integer not between 1 and 16384 then
        raise exception 'invalid_canvas_resize_restore_dimension';
      end if;
    end loop;
    if (v_data->>'width')::bigint * (v_data->>'height')::bigint > 268435456 then
      raise exception 'canvas_too_large';
    end if;
    for v_key in select unnest(array['offsetX','offsetY']) loop
      if jsonb_typeof(v_data->v_key) <> 'number' or (v_data->>v_key)::numeric <> trunc((v_data->>v_key)::numeric)
         or abs((v_data->>v_key)::integer) > 16384 then
        raise exception 'invalid_canvas_resize_restore_offset';
      end if;
    end loop;
  elsif v_action = 'frame_clone' then
    if (select count(*) from jsonb_object_keys(v_data)) <> 3 or not (v_data ?& array['canvasId','afterFrameId','clones'])
       or (v_data->'afterFrameId' <> 'null'::jsonb and (jsonb_typeof(v_data->'afterFrameId') <> 'string' or char_length(v_data->>'afterFrameId') not between 1 and 128))
       or jsonb_typeof(v_data->'clones') <> 'array' or jsonb_array_length(v_data->'clones') not between 1 and 1024 then raise exception 'invalid_frame_clone'; end if;
    for v_item in select value from jsonb_array_elements(v_data->'clones') loop
      if jsonb_typeof(v_item) <> 'object' or (select count(*) from jsonb_object_keys(v_item)) <> 5
         or not (v_item ?& array['sourceFrameId','frameId','name','duration','layerIds'])
         or jsonb_typeof(v_item->'sourceFrameId') <> 'string' or char_length(v_item->>'sourceFrameId') not between 1 and 128
         or jsonb_typeof(v_item->'frameId') <> 'string' or char_length(v_item->>'frameId') not between 1 and 128
         or v_item->>'sourceFrameId' = v_item->>'frameId'
         or jsonb_typeof(v_item->'name') <> 'string' or char_length(v_item->>'name') > 120
         or jsonb_typeof(v_item->'duration') <> 'number' or (v_item->>'duration')::numeric <> trunc((v_item->>'duration')::numeric)
         or (v_item->>'duration')::integer not between 1 and 655350
         or jsonb_typeof(v_item->'layerIds') <> 'array' or jsonb_array_length(v_item->'layerIds') not between 1 and 4096
         or (select count(distinct value #>> '{}') from jsonb_array_elements(v_item->'layerIds')) <> jsonb_array_length(v_item->'layerIds') then raise exception 'invalid_frame_clone'; end if;
      for v_layer in select value from jsonb_array_elements(v_item->'layerIds') loop
        if jsonb_typeof(v_layer) <> 'string' or char_length(v_layer #>> '{}') not between 1 and 128 then raise exception 'invalid_frame_clone_layer'; end if;
      end loop;
    end loop;
  elsif v_action in ('frame_order', 'layer_order') then
    if (select count(*) from jsonb_object_keys(v_data)) <> 2
       or not (v_data ? (case when v_action = 'frame_order' then 'frameIds' else 'trackIds' end)) then raise exception 'invalid_structure_order'; end if;
    v_layer := v_data->(case when v_action = 'frame_order' then 'frameIds' else 'trackIds' end);
    if jsonb_typeof(v_layer) <> 'array' or jsonb_array_length(v_layer) not between 1 and 4096
       or (select count(distinct value #>> '{}') from jsonb_array_elements(v_layer)) <> jsonb_array_length(v_layer) then raise exception 'invalid_structure_order'; end if;
    for v_item in select value from jsonb_array_elements(v_layer) loop
      if jsonb_typeof(v_item) <> 'string' or char_length(v_item #>> '{}') not between 1 and 128 then raise exception 'invalid_structure_order_id'; end if;
    end loop;
  elsif v_action = 'canvas_resize' then
    if (select count(*) from jsonb_object_keys(v_data)) not between 7 and 8
       or not (v_data ?& array['canvasId','fromWidth','fromHeight','width','height','offsetX','offsetY']) then
      raise exception 'invalid_canvas_resize';
    end if;
    if (select count(*) from jsonb_object_keys(v_data)) = 8 and not (v_data ? 'inverseAsset') then
      raise exception 'invalid_canvas_resize';
    end if;
    for v_key in select unnest(array['fromWidth','fromHeight','width','height']) loop
      if jsonb_typeof(v_data->v_key) <> 'number' or (v_data->>v_key)::numeric <> trunc((v_data->>v_key)::numeric)
         or (v_data->>v_key)::integer not between 1 and 16384 then raise exception 'invalid_canvas_resize_dimension'; end if;
    end loop;
    if (v_data->>'width')::bigint * (v_data->>'height')::bigint > 268435456 then raise exception 'canvas_too_large'; end if;
    for v_key in select unnest(array['offsetX','offsetY']) loop
      if jsonb_typeof(v_data->v_key) <> 'number' or (v_data->>v_key)::numeric <> trunc((v_data->>v_key)::numeric)
         or abs((v_data->>v_key)::integer) > 16384 then raise exception 'invalid_canvas_resize_offset'; end if;
    end loop;
    -- A supplied inverse asset must always be canonical.  Shrinking is the
    -- case where it is mandatory; accepting a malformed optional asset for an
    -- expansion would leave a future undo with an unverified payload.
    if (v_data ? 'inverseAsset') and (jsonb_typeof(v_data->'inverseAsset') <> 'object'
         or (select count(*) from jsonb_object_keys(v_data->'inverseAsset')) <> 4
         or not (v_data->'inverseAsset' ?& array['objectPath','sha256Hex','byteLength','codecVersion'])
         or jsonb_typeof(v_data->'inverseAsset'->'objectPath') <> 'string'
         or v_data->'inverseAsset'->>'objectPath' !~ '^rooms/[0-9a-f-]{36}/document-checkpoints/[0-9a-f-]{36}\.pxd$'
         or jsonb_typeof(v_data->'inverseAsset'->'sha256Hex') <> 'string' or v_data->'inverseAsset'->>'sha256Hex' !~ '^[0-9a-f]{64}$'
         or jsonb_typeof(v_data->'inverseAsset'->'byteLength') <> 'number' or (v_data->'inverseAsset'->>'byteLength')::integer not between 1 and 52428800
         or (v_data->'inverseAsset'->>'codecVersion')::integer <> 1) then
      raise exception 'invalid_canvas_resize_asset';
    end if;
    if ((v_data->>'width')::integer < (v_data->>'fromWidth')::integer or (v_data->>'height')::integer < (v_data->>'fromHeight')::integer)
       and (not (v_data ? 'inverseAsset')) then
      raise exception 'invalid_canvas_resize_asset';
    end if;
  else
    raise exception 'unreleased_structure_delta_action';
  end if;
  return 'structure_delta';
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'invalid_structure_delta_value';
end
$$;

create or replace function collab_v1.validate_document_operation(p_document jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(p_document) = 'object' and p_document->>'type' = 'structure_delta' then
    return collab_v1.validate_structure_delta(p_document);
  end if;
  return collab_v1.validate_document_operation_v1(p_document);
end
$$;

revoke all on function collab_v1.validate_document_operation_v1(jsonb) from public, anon, authenticated;
revoke all on function collab_v1.validate_structure_delta(jsonb) from public, anon, authenticated;
revoke all on function collab_v1.validate_document_operation(jsonb) from public, anon, authenticated;

-- PL/pgSQL resolves referenced function OIDs when it compiles a statement.
-- Recreate the caller so it resolves the new dispatcher rather than the
-- renamed v1 validator on a warm PostgREST connection.
create or replace function public.pixisync_commit_document_operation(
  p_room_id uuid, p_operation_id uuid, p_client_id uuid,
  p_base_revision bigint, p_structure_epoch bigint,
  p_payload bytea, p_payload_sha256 bytea
)
returns table (
  commit_status text, revision bigint, structure_epoch bigint,
  payload_b64 text, payload_sha256_hex text, pixel_count integer,
  requested_pixel_count integer, skipped_pixel_count integer
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
  v_next_revision bigint;
  v_next_epoch bigint;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_operation_id is null or p_client_id is null or p_base_revision < 0 or p_structure_epoch < 0
     or octet_length(p_payload) not between 2 and 262144 or octet_length(p_payload_sha256) <> 32 then
    raise exception 'invalid_document_operation_shape';
  end if;
  select * into v_room from collab_v1.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'active' then raise exception 'room_not_active'; end if;
  select role into v_role from collab_v1.room_members where room_id = p_room_id and user_id = v_user_id and revoked_at is null;
  if v_role not in ('owner', 'editor') then raise exception 'not_editor'; end if;
  v_digest := extensions.digest(p_payload, 'sha256');
  if v_digest <> p_payload_sha256 then raise exception 'payload_hash_mismatch'; end if;
  begin
    v_document := convert_from(p_payload, 'utf8')::jsonb;
    perform collab_v1.validate_document_operation(v_document);
  exception when others then
    raise exception 'invalid_document_operation_json';
  end;
  select * into v_existing from collab_v1.operations where room_id = p_room_id and operation_id = p_operation_id;
  if found then
    if v_existing.actor_user_id <> v_user_id or v_existing.actor_client_id <> p_client_id
       or v_existing.kind <> 'document_patch' or v_existing.codec_version <> 2
       or v_existing.pixel_count <> 0 or v_existing.requested_pixel_count <> 0
       or v_existing.payload_sha256 <> v_digest then raise exception 'operation_id_conflict'; end if;
    return query select 'duplicate'::text, v_existing.revision, v_existing.structure_epoch,
      encode(v_existing.payload, 'base64'), encode(v_existing.payload_sha256, 'hex'),
      v_existing.pixel_count, v_existing.requested_pixel_count, v_existing.skipped_pixel_count;
    return;
  end if;
  if p_base_revision <> v_room.head_revision then raise exception 'stale_base_revision'; end if;
  if p_structure_epoch <> v_room.structure_epoch then raise exception 'stale_structure_epoch'; end if;
  if v_room.head_revision >= 9223372036854775806 or v_room.structure_epoch >= 9223372036854775806 then
    raise exception 'revision_limit_reached';
  end if;
  v_next_revision := v_room.head_revision + 1;
  v_next_epoch := v_room.structure_epoch + 1;
  insert into collab_v1.operations (
    room_id, revision, operation_id, actor_user_id, actor_client_id, kind, structure_epoch,
    codec_version, canvas_id, frame_id, layer_id, canvas_width, canvas_height, payload,
    payload_sha256, pixel_count, requested_pixel_count, skipped_pixel_count,
    request_payload_sha256, undo_of_operation_id
  ) values (
    p_room_id, v_next_revision, p_operation_id, v_user_id, p_client_id, 'document_patch',
    v_next_epoch, 2, '__document__', '__document__', '__document__', 1, 1, p_payload,
    v_digest, 0, 0, 0, v_digest, null
  );
  update collab_v1.rooms set head_revision = v_next_revision, structure_epoch = v_next_epoch,
    updated_at = timezone('utc', now()) where id = p_room_id;
  return query select 'committed'::text, v_next_revision, v_next_epoch,
    encode(p_payload, 'base64'), encode(v_digest, 'hex'), 0, 0, 0;
end
$$;

revoke all on function public.pixisync_commit_document_operation(uuid, uuid, uuid, bigint, bigint, bytea, bytea) from public, anon;
grant execute on function public.pixisync_commit_document_operation(uuid, uuid, uuid, bigint, bigint, bytea, bytea) to authenticated;

-- Bind a small semantic inverse asset to the same ordered operation and
-- staging reservation used by checkpoint restores. A committed asset may be
-- referenced by a later undo/redo operation, but an uncommitted reservation
-- is accepted only for its own forward operation.
create or replace function collab_v1.guard_document_checkpoint_operation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document jsonb;
  v_asset jsonb;
  v_upload collab_v1.document_checkpoint_uploads%rowtype;
begin
  if new.kind <> 'document_patch' or new.codec_version <> 2 then return new; end if;
  begin v_document := convert_from(new.payload, 'utf8')::jsonb;
  exception when others then return new; end;
  if v_document->>'type' = 'checkpoint_restore' then
    v_asset := jsonb_build_object(
      'objectPath', v_document->'objectPath',
      'sha256Hex', v_document->'sha256Hex',
      'byteLength', v_document->'byteLength'
    );
  elsif v_document->>'type' = 'structure_delta' then
    if jsonb_typeof(v_document#>'{data,inverseAsset}') = 'object' then
      v_asset := v_document#>'{data,inverseAsset}';
    end if;
  else
    return new;
  end if;
  if v_asset is not null then
    select * into v_upload from collab_v1.document_checkpoint_uploads
    where room_id = new.room_id and storage_path = v_asset->>'objectPath' for update;
    if not found
       or v_asset->>'objectPath' !~ ('^rooms/' || new.room_id::text || '/document-checkpoints/[0-9a-f-]{36}\.pxd$')
       or v_upload.storage_path <> v_asset->>'objectPath'
       or encode(v_upload.state_sha256, 'hex') <> v_asset->>'sha256Hex'
       or v_upload.encoded_bytes <> (v_asset->>'byteLength')::integer
       or (v_upload.committed_revision is null and (
         v_upload.cleanup_claimed_at is not null or v_upload.upload_id <> new.operation_id
         or v_upload.created_by <> new.actor_user_id or v_upload.actor_client_id <> new.actor_client_id
         or v_upload.base_revision <> new.revision - 1 or v_upload.structure_epoch <> new.structure_epoch - 1
         or v_upload.expires_at <= timezone('utc', now())
       )) then raise exception 'invalid_document_checkpoint_upload'; end if;
    if not exists (select 1 from storage.objects where bucket_id = 'pixisync-checkpoints' and name = v_upload.storage_path) then
      raise exception 'document_checkpoint_blob_missing';
    end if;
    if v_upload.committed_revision is null then
      update collab_v1.document_checkpoint_uploads set committed_revision = new.revision where upload_id = v_upload.upload_id;
    end if;
  end if;
  -- Writer stamps describe concrete pixels in the pre-structure document.
  -- Never allow them to survive a document replacement, layer/frame removal,
  -- resize, or an ordering/clone operation that can reuse IDs.  Reset only
  -- the affected canvas for semantic deltas; a checkpoint has no safe
  -- per-canvas boundary and therefore invalidates the whole room.
  if v_document->>'type' = 'checkpoint_restore' then
    delete from collab_v1.writer_state where room_id = new.room_id;
  elsif v_document->>'type' = 'structure_delta' then
    delete from collab_v1.writer_state
    where room_id = new.room_id
      and canvas_id = v_document#>>'{data,canvasId}';
  end if;
  return new;
end
$$;

revoke all on function collab_v1.guard_document_checkpoint_operation() from public, anon, authenticated;
