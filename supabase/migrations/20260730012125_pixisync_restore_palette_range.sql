-- PiXiEEDraw reserves runtime palette value 0 for transparency; 255 is not
-- writable by the tiled raster setter and must be rejected at the server too.
create or replace function collab_v1.validate_pixel_patch(p_payload bytea, p_cell_count bigint)
returns integer
language plpgsql immutable set search_path = '' as $$
declare v_length integer := octet_length(p_payload); v_offset integer := 6; v_count bigint := 0; v_value bigint; v_shift integer; v_bytes integer; v_byte integer; v_index bigint := -1; v_delta bigint; v_i integer; v_color integer;
begin
  if p_cell_count < 1 or p_payload is null or v_length < 7 or v_length > 49152 then raise exception 'invalid_pixel_patch'; end if;
  if get_byte(p_payload, 0) <> 80 or get_byte(p_payload, 1) <> 105 or get_byte(p_payload, 2) <> 88 or get_byte(p_payload, 3) <> 83 or get_byte(p_payload, 4) <> 1 or get_byte(p_payload, 5) <> 0 then raise exception 'invalid_pixel_patch_header'; end if;
  v_value := 0; v_shift := 0; v_bytes := 0;
  loop
    if v_offset >= v_length or v_bytes >= 5 then raise exception 'invalid_pixel_patch_varuint'; end if;
    v_byte := get_byte(p_payload, v_offset); v_offset := v_offset + 1; v_value := v_value + ((v_byte & 127)::bigint << v_shift); v_shift := v_shift + 7; v_bytes := v_bytes + 1; exit when (v_byte & 128) = 0;
  end loop;
  if v_bytes > 1 and v_value < (1::bigint << (7 * (v_bytes - 1))) then raise exception 'noncanonical_pixel_patch_varuint'; end if;
  if v_value not between 1 and 8192 then raise exception 'invalid_pixel_patch_count'; end if;
  v_count := v_value;
  for v_i in 1..v_count loop
    v_value := 0; v_shift := 0; v_bytes := 0;
    loop
      if v_offset >= v_length or v_bytes >= 5 then raise exception 'invalid_pixel_patch_varuint'; end if;
      v_byte := get_byte(p_payload, v_offset); v_offset := v_offset + 1; v_value := v_value + ((v_byte & 127)::bigint << v_shift); v_shift := v_shift + 7; v_bytes := v_bytes + 1; exit when (v_byte & 128) = 0;
    end loop;
    if v_bytes > 1 and v_value < (1::bigint << (7 * (v_bytes - 1))) then raise exception 'noncanonical_pixel_patch_varuint'; end if;
    v_delta := v_value;
    if v_i > 1 and v_delta = 0 then raise exception 'nonascending_pixel_patch_index'; end if;
    v_index := case when v_i = 1 then v_delta else v_index + v_delta end;
    if v_index < 0 or v_index >= p_cell_count then raise exception 'pixel_patch_index_out_of_range'; end if;
    if v_offset >= v_length then raise exception 'truncated_pixel_patch'; end if;
    v_color := get_byte(p_payload, v_offset); v_offset := v_offset + 1;
    if v_color > 254 then raise exception 'pixel_patch_palette_out_of_range'; end if;
  end loop;
  if v_offset <> v_length then raise exception 'pixel_patch_trailing_bytes'; end if;
  return v_count::integer;
end $$;
