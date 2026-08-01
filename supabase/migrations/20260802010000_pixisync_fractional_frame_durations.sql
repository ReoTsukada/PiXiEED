-- PiXiEEDraw stores frame timing in milliseconds and its canonical 12fps
-- default is 1000 / 12 (83.333...). The original structure-delta validator
-- accidentally required integer durations for frame insert/clone even though
-- document and frame-property validators accept finite fractional durations.
-- Replacing the same function keeps its OID stable for already-compiled callers
-- and lets previously journaled valid operations complete after rollout.

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
       or jsonb_typeof(v_data->'frame'->'duration') <> 'number'
       or (v_data->'frame'->>'duration')::numeric not between 1 and 655350
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
         or jsonb_typeof(v_item->'duration') <> 'number'
         or (v_item->>'duration')::numeric not between 1 and 655350
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
