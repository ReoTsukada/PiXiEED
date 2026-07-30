-- PiXiSYNC V1: server-authoritative per-cell writer stamps.
--
-- This migration intentionally replaces only the public operation/read RPCs.
-- No browser role can write any collab_v1 table directly.  A guarded request
-- is not persisted verbatim: the immutable operation row contains the exact
-- canonical (unguarded) cells which the server actually applied.

create table if not exists collab_v1.writer_state (
  room_id uuid not null references collab_v1.rooms(id) on delete cascade,
  canvas_id text not null check (char_length(canvas_id) between 1 and 128),
  frame_id text not null check (char_length(frame_id) between 1 and 128),
  layer_id text not null check (char_length(layer_id) between 1 and 128),
  cell_index integer not null check (cell_index >= 0),
  pixel_value smallint not null check (pixel_value between 0 and 254),
  writer_revision bigint not null check (writer_revision > 0),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (room_id, canvas_id, frame_id, layer_id, cell_index)
);

create index if not exists pixisync_writer_state_target_revision_idx
  on collab_v1.writer_state (room_id, canvas_id, frame_id, layer_id, writer_revision, cell_index);

alter table collab_v1.writer_state enable row level security;
revoke all on collab_v1.writer_state from public, anon, authenticated;
drop policy if exists pixisync_writer_state_client_deny on collab_v1.writer_state;
create policy pixisync_writer_state_client_deny
  on collab_v1.writer_state as restrictive for all to authenticated
  using (false) with check (false);

create table if not exists collab_v1.operation_guard_audits (
  room_id uuid not null,
  operation_id uuid not null,
  revision bigint not null check (revision > 0),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  kind collab_v1.operation_kind not null check (kind in ('undo_pixel_patch', 'redo_pixel_patch')),
  source_operation_id uuid not null,
  requested_pixel_count integer not null check (requested_pixel_count between 1 and 8192),
  applied_pixel_count integer not null check (applied_pixel_count between 0 and requested_pixel_count),
  skipped_pixel_count integer not null check (skipped_pixel_count = requested_pixel_count - applied_pixel_count),
  request_payload_sha256 bytea not null check (octet_length(request_payload_sha256) = 32),
  applied_payload_sha256 bytea not null check (octet_length(applied_payload_sha256) = 32),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (room_id, operation_id),
  foreign key (room_id, operation_id)
    references collab_v1.operations(room_id, operation_id) on delete cascade
);

alter table collab_v1.operation_guard_audits enable row level security;
revoke all on collab_v1.operation_guard_audits from public, anon, authenticated;
drop policy if exists pixisync_operation_guard_audits_client_deny on collab_v1.operation_guard_audits;
create policy pixisync_operation_guard_audits_client_deny
  on collab_v1.operation_guard_audits as restrictive for all to authenticated
  using (false) with check (false);

alter table collab_v1.operations
  add column if not exists requested_pixel_count integer,
  add column if not exists skipped_pixel_count integer,
  add column if not exists request_payload_sha256 bytea;

update collab_v1.operations
set
  requested_pixel_count = pixel_count,
  skipped_pixel_count = 0,
  request_payload_sha256 = payload_sha256
where requested_pixel_count is null
   or skipped_pixel_count is null
   or request_payload_sha256 is null;

alter table collab_v1.operations
  alter column requested_pixel_count set not null,
  alter column skipped_pixel_count set not null,
  alter column request_payload_sha256 set not null;

alter table collab_v1.operations
  drop constraint if exists operations_pixel_count_check,
  drop constraint if exists pixisync_operations_actual_pixel_count_check,
  drop constraint if exists pixisync_operations_empty_guard_only_check,
  drop constraint if exists pixisync_operations_requested_pixel_count_check,
  drop constraint if exists pixisync_operations_skipped_pixel_count_check,
  drop constraint if exists pixisync_operations_request_payload_sha256_check;

alter table collab_v1.operations
  add constraint pixisync_operations_actual_pixel_count_check
    check (pixel_count between 0 and 8192),
  add constraint pixisync_operations_empty_guard_only_check
    check (pixel_count > 0 or kind in ('undo_pixel_patch', 'redo_pixel_patch')),
  add constraint pixisync_operations_requested_pixel_count_check
    check (requested_pixel_count between 1 and 8192),
  add constraint pixisync_operations_skipped_pixel_count_check
    check (skipped_pixel_count = requested_pixel_count - pixel_count),
  add constraint pixisync_operations_request_payload_sha256_check
    check (octet_length(request_payload_sha256) = 32);

-- Appending bytea through one audited helper avoids off-by-one set_byte calls.
create or replace function collab_v1.append_byte(p_bytes bytea, p_value integer)
returns bytea
language plpgsql immutable set search_path = '' as $$
begin
  if p_value not between 0 and 255 then
    raise exception 'pixisync_invalid_byte';
  end if;
  return coalesce(p_bytes, ''::bytea) || decode(lpad(to_hex(p_value), 2, '0'), 'hex');
end;
$$;

create or replace function collab_v1.append_varuint(p_bytes bytea, p_value bigint)
returns bytea
language plpgsql immutable set search_path = '' as $$
declare
  v_result bytea := coalesce(p_bytes, ''::bytea);
  v_current bigint := p_value;
  v_part integer;
begin
  if v_current < 0 then
    raise exception 'pixisync_negative_varuint';
  end if;
  loop
    v_part := (v_current & 127)::integer;
    v_current := v_current >> 7;
    if v_current <> 0 then v_part := v_part | 128; end if;
    v_result := collab_v1.append_byte(v_result, v_part);
    exit when v_current = 0;
  end loop;
  return v_result;
end;
$$;

-- Strict decoder.  `p_expected_flags=0` is a normal canonical patch, while
-- `=1` contains a signed-bigint-safe expected writer revision after each cell.
create or replace function collab_v1.decode_pixel_patch(
  p_payload bytea,
  p_cell_count bigint,
  p_expected_flags integer,
  p_allow_empty boolean default false
)
returns table (cell_index integer, palette_value smallint, expected_writer_revision bigint)
language plpgsql immutable set search_path = '' as $$
declare
  v_length integer := octet_length(p_payload);
  v_offset integer := 6;
  v_count bigint := 0;
  v_value bigint;
  v_shift integer;
  v_bytes integer;
  v_byte integer;
  v_previous bigint := -1;
  v_index bigint;
  v_i integer;
  v_palette integer;
  v_expected bigint;
begin
  if p_cell_count < 1 or p_payload is null or v_length < 7 or v_length > 49152
     or p_expected_flags not in (0, 1) then
    raise exception 'pixisync_invalid_pixel_patch';
  end if;
  if get_byte(p_payload, 0) <> 80 or get_byte(p_payload, 1) <> 105
     or get_byte(p_payload, 2) <> 88 or get_byte(p_payload, 3) <> 83
     or get_byte(p_payload, 4) <> 1 or get_byte(p_payload, 5) <> p_expected_flags then
    raise exception 'pixisync_invalid_pixel_patch_header';
  end if;

  -- count varuint: five bytes and minimal encoding.
  v_value := 0; v_shift := 0; v_bytes := 0;
  loop
    if v_offset >= v_length or v_bytes >= 5 then raise exception 'pixisync_invalid_pixel_patch_varuint'; end if;
    v_byte := get_byte(p_payload, v_offset); v_offset := v_offset + 1;
    v_value := v_value + ((v_byte & 127)::bigint << v_shift);
    v_shift := v_shift + 7; v_bytes := v_bytes + 1;
    exit when (v_byte & 128) = 0;
  end loop;
  if v_bytes > 1 and v_value < (1::bigint << (7 * (v_bytes - 1))) then raise exception 'pixisync_noncanonical_pixel_patch_varuint'; end if;
  if v_value < 0 or v_value > 8192 or (v_value = 0 and not p_allow_empty) then raise exception 'pixisync_invalid_pixel_patch_count'; end if;
  v_count := v_value;

  for v_i in 1..v_count loop
    v_value := 0; v_shift := 0; v_bytes := 0;
    loop
      if v_offset >= v_length or v_bytes >= 5 then raise exception 'pixisync_invalid_pixel_patch_varuint'; end if;
      v_byte := get_byte(p_payload, v_offset); v_offset := v_offset + 1;
      v_value := v_value + ((v_byte & 127)::bigint << v_shift);
      v_shift := v_shift + 7; v_bytes := v_bytes + 1;
      exit when (v_byte & 128) = 0;
    end loop;
    if v_bytes > 1 and v_value < (1::bigint << (7 * (v_bytes - 1))) then raise exception 'pixisync_noncanonical_pixel_patch_varuint'; end if;
    if v_i > 1 and v_value = 0 then raise exception 'pixisync_nonascending_pixel_patch_index'; end if;
    v_index := case when v_i = 1 then v_value else v_previous + v_value end;
    if v_index < 0 or v_index >= p_cell_count then raise exception 'pixisync_pixel_patch_index_out_of_range'; end if;
    if v_offset >= v_length then raise exception 'pixisync_truncated_pixel_patch'; end if;
    v_palette := get_byte(p_payload, v_offset); v_offset := v_offset + 1;
    if v_palette > 254 then raise exception 'pixisync_pixel_patch_palette_out_of_range'; end if;

    v_expected := null;
    if p_expected_flags = 1 then
      v_value := 0; v_shift := 0; v_bytes := 0;
      loop
        if v_offset >= v_length or v_bytes >= 9 then raise exception 'pixisync_invalid_writer_revision_varuint'; end if;
        v_byte := get_byte(p_payload, v_offset); v_offset := v_offset + 1;
        v_value := v_value + ((v_byte & 127)::bigint << v_shift);
        v_shift := v_shift + 7; v_bytes := v_bytes + 1;
        exit when (v_byte & 128) = 0;
      end loop;
      if v_bytes > 1 and v_value < (1::bigint << (7 * (v_bytes - 1))) then raise exception 'pixisync_noncanonical_writer_revision_varuint'; end if;
      if v_value < 1 then raise exception 'pixisync_invalid_expected_writer_revision'; end if;
      v_expected := v_value;
    end if;
    cell_index := v_index::integer;
    palette_value := v_palette::smallint;
    expected_writer_revision := v_expected;
    return next;
    v_previous := v_index;
  end loop;
  if v_offset <> v_length then raise exception 'pixisync_pixel_patch_trailing_bytes'; end if;
end;
$$;

-- Drop the previous PL/pgSQL caller first: it references the two-argument
-- validator, and PostgreSQL must not retain that overload beside defaults.
revoke all on function public.pixisync_commit_operation(uuid, uuid, uuid, text, bigint, smallint, text, text, text, integer, integer, bytea, bytea, integer, uuid) from public, anon, authenticated;
drop function public.pixisync_commit_operation(uuid, uuid, uuid, text, bigint, smallint, text, text, text, integer, integer, bytea, bytea, integer, uuid);
revoke all on function collab_v1.validate_pixel_patch(bytea, bigint) from public, anon, authenticated;
drop function collab_v1.validate_pixel_patch(bytea, bigint);

create function collab_v1.validate_pixel_patch(
  p_payload bytea,
  p_cell_count bigint,
  p_expected_flags integer default 0,
  p_allow_empty boolean default false
)
returns integer
language sql immutable set search_path = '' as $$
  select count(*)::integer
  from collab_v1.decode_pixel_patch(p_payload, p_cell_count, p_expected_flags, p_allow_empty)
$$;

revoke all on function collab_v1.append_byte(bytea, integer) from public, anon, authenticated;
revoke all on function collab_v1.append_varuint(bytea, bigint) from public, anon, authenticated;
revoke all on function collab_v1.decode_pixel_patch(bytea, bigint, integer, boolean) from public, anon, authenticated;
revoke all on function collab_v1.validate_pixel_patch(bytea, bigint, integer, boolean) from public, anon, authenticated;

revoke all on function public.pixisync_get_ops_since(uuid, bigint, integer) from public, anon, authenticated;
drop function public.pixisync_get_ops_since(uuid, bigint, integer);

create function public.pixisync_get_ops_since(p_room_id uuid, p_after_revision bigint default 0, p_limit integer default 250)
returns table (
  revision bigint, operation_id uuid, actor_user_id uuid, actor_client_id uuid, kind text,
  structure_epoch bigint, codec_version smallint, canvas_id text, frame_id text, layer_id text,
  canvas_width integer, canvas_height integer, payload_b64 text, payload_sha256_hex text,
  pixel_count integer, requested_pixel_count integer, skipped_pixel_count integer,
  request_payload_sha256_hex text, undo_of_operation_id uuid, created_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
begin
  if not collab_v1.is_active_member(p_room_id) then raise exception 'not_active_member'; end if;
  return query
  select op.revision, op.operation_id, op.actor_user_id, op.actor_client_id, op.kind::text,
    op.structure_epoch, op.codec_version, op.canvas_id, op.frame_id, op.layer_id,
    op.canvas_width, op.canvas_height, encode(op.payload, 'base64'), encode(op.payload_sha256, 'hex'),
    op.pixel_count, op.requested_pixel_count, op.skipped_pixel_count,
    encode(op.request_payload_sha256, 'hex'), op.undo_of_operation_id, op.created_at
  from collab_v1.operations as op
  where op.room_id = p_room_id and op.revision > greatest(0, coalesce(p_after_revision, 0))
  order by op.revision asc
  limit least(greatest(coalesce(p_limit, 250), 1), 500);
end;
$$;

create function public.pixisync_commit_operation(
  p_room_id uuid, p_operation_id uuid, p_client_id uuid, p_kind text, p_structure_epoch bigint, p_codec_version smallint,
  p_canvas_id text, p_frame_id text, p_layer_id text, p_canvas_width integer, p_canvas_height integer,
  p_payload bytea, p_payload_sha256 bytea, p_pixel_count integer, p_undo_of_operation_id uuid default null
)
returns table (
  commit_status text, revision bigint, payload_b64 text, payload_sha256_hex text,
  pixel_count integer, requested_pixel_count integer, skipped_pixel_count integer
)
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_room collab_v1.rooms%rowtype;
  v_role collab_v1.member_role;
  v_existing collab_v1.operations%rowtype;
  v_source collab_v1.operations%rowtype;
  v_writer collab_v1.writer_state%rowtype;
  v_request_digest bytea;
  v_actual_digest bytea;
  v_requested_count integer;
  v_applied_count integer := 0;
  v_skipped_count integer := 0;
  v_next_revision bigint;
  v_actual_payload bytea;
  v_body bytea := ''::bytea;
  v_previous_index integer := -1;
  v_actual_indices integer[] := '{}'::integer[];
  v_actual_values smallint[] := '{}'::smallint[];
  v_array_position integer;
  v_change record;
  v_expected_flags integer;
  v_is_guard boolean;
  v_matches boolean;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_room_id is null or p_operation_id is null or p_client_id is null then raise exception 'invalid_operation_identity'; end if;

  -- Every operation mutation follows this lock hierarchy: room -> source ->
  -- writer rows in ascending cell index.  The room row serialises revisions
  -- and makes absent-row UPSERTs safe as well.
  select * into v_room from collab_v1.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'active' then raise exception 'room_not_active'; end if;
  select role into v_role from collab_v1.room_members
    where room_id = p_room_id and user_id = v_user_id and revoked_at is null;
  if v_role not in ('owner', 'editor') then raise exception 'not_editor'; end if;

  if p_payload is null or p_payload_sha256 is null or octet_length(p_payload_sha256) <> 32 then
    raise exception 'invalid_operation_shape';
  end if;
  v_request_digest := extensions.digest(p_payload, 'sha256');

  -- Idempotency is checked before any codec, guard, writer-state or revision
  -- work.  Reusing an id with even one distinct immutable request is rejected.
  select * into v_existing from collab_v1.operations
    where room_id = p_room_id and operation_id = p_operation_id;
  if found then
    if v_existing.actor_user_id <> v_user_id
       or v_existing.actor_client_id <> p_client_id
       or v_existing.kind::text <> p_kind
       or v_existing.structure_epoch <> p_structure_epoch
       or v_existing.codec_version <> p_codec_version
       or v_existing.canvas_id <> p_canvas_id
       or v_existing.frame_id <> p_frame_id
       or v_existing.layer_id <> p_layer_id
       or v_existing.canvas_width <> p_canvas_width
       or v_existing.canvas_height <> p_canvas_height
       or v_existing.requested_pixel_count <> p_pixel_count
       or v_existing.undo_of_operation_id is distinct from p_undo_of_operation_id
       or v_existing.request_payload_sha256 <> v_request_digest
       or v_request_digest <> p_payload_sha256 then
      raise exception 'operation_id_reuse_mismatch';
    end if;
    return query select 'duplicate'::text, v_existing.revision,
      encode(v_existing.payload, 'base64'), encode(v_existing.payload_sha256, 'hex'),
      v_existing.pixel_count, v_existing.requested_pixel_count, v_existing.skipped_pixel_count;
    return;
  end if;

  if p_kind not in ('pixel_patch', 'undo_pixel_patch', 'redo_pixel_patch')
     or p_codec_version <> 1 or p_structure_epoch <> v_room.structure_epoch
     or octet_length(p_payload) not between 7 and 49152
     or p_pixel_count not between 1 and 8192
     or char_length(coalesce(p_canvas_id, '')) not between 1 and 128
     or char_length(coalesce(p_frame_id, '')) not between 1 and 128
     or char_length(coalesce(p_layer_id, '')) not between 1 and 128
     or p_canvas_width not between 1 and 16384 or p_canvas_height not between 1 and 16384
     or p_canvas_width::bigint * p_canvas_height::bigint > 268435456
     or v_request_digest <> p_payload_sha256 then
    raise exception 'invalid_operation_shape';
  end if;

  v_is_guard := p_kind in ('undo_pixel_patch', 'redo_pixel_patch');
  v_expected_flags := case when v_is_guard then 1 else 0 end;
  v_requested_count := collab_v1.validate_pixel_patch(
    p_payload, p_canvas_width::bigint * p_canvas_height::bigint, v_expected_flags, false
  );
  if v_requested_count <> p_pixel_count then raise exception 'pixel_count_mismatch'; end if;
  if (not v_is_guard and p_undo_of_operation_id is not null)
     or (v_is_guard and p_undo_of_operation_id is null) then
    raise exception 'invalid_undo_target';
  end if;

  if v_is_guard then
    select * into v_source from collab_v1.operations
      where room_id = p_room_id and operation_id = p_undo_of_operation_id
      for update;
    if not found or v_source.actor_user_id <> v_user_id
       or v_source.canvas_id <> p_canvas_id or v_source.frame_id <> p_frame_id or v_source.layer_id <> p_layer_id
       or v_source.canvas_width <> p_canvas_width or v_source.canvas_height <> p_canvas_height then
      raise exception 'undo_target_not_owned';
    end if;
    if (p_kind = 'undo_pixel_patch' and v_source.kind not in ('pixel_patch', 'redo_pixel_patch'))
       or (p_kind = 'redo_pixel_patch' and v_source.kind <> 'undo_pixel_patch') then
      raise exception 'invalid_undo_transition';
    end if;
  end if;

  if not v_is_guard then
    v_actual_payload := p_payload;
    v_applied_count := v_requested_count;
  else
    -- The source revision is the only valid guard stamp.  A retry or a stale
    -- client cannot turn an undo into a conditional overwrite of another op.
    for v_change in
      select * from collab_v1.decode_pixel_patch(
        p_payload, p_canvas_width::bigint * p_canvas_height::bigint, 1, false
      ) order by cell_index
    loop
      if v_change.expected_writer_revision <> v_source.revision then
        raise exception 'invalid_guard_source_revision';
      end if;
      select * into v_writer from collab_v1.writer_state
        where room_id = p_room_id and canvas_id = p_canvas_id and frame_id = p_frame_id
          and layer_id = p_layer_id and cell_index = v_change.cell_index
        for update;
      v_matches := found and v_writer.writer_revision = v_change.expected_writer_revision;
      if v_matches then
        v_body := collab_v1.append_varuint(
          v_body,
          case when v_applied_count = 0 then v_change.cell_index::bigint else (v_change.cell_index - v_previous_index)::bigint end
        );
        v_body := collab_v1.append_byte(v_body, v_change.palette_value);
        v_actual_indices := array_append(v_actual_indices, v_change.cell_index);
        v_actual_values := array_append(v_actual_values, v_change.palette_value);
        v_previous_index := v_change.cell_index;
        v_applied_count := v_applied_count + 1;
      end if;
    end loop;
    v_skipped_count := v_requested_count - v_applied_count;
    v_actual_payload := decode('506958530100', 'hex') || collab_v1.append_varuint(''::bytea, v_applied_count) || v_body;
    if collab_v1.validate_pixel_patch(
      v_actual_payload, p_canvas_width::bigint * p_canvas_height::bigint, 0, true
    ) <> v_applied_count then
      raise exception 'canonical_payload_regeneration_failed';
    end if;
  end if;

  -- The authoritative revision is allocated only after the exact applied
  -- payload is known. The locked room row keeps this a gap-free room counter.
  if v_room.head_revision = 9223372036854775807 then
    raise exception 'revision_exhausted';
  end if;
  v_next_revision := v_room.head_revision + 1;
  v_actual_digest := extensions.digest(v_actual_payload, 'sha256');
  insert into collab_v1.operations (
    room_id, revision, operation_id, actor_user_id, actor_client_id, kind, structure_epoch, codec_version,
    canvas_id, frame_id, layer_id, canvas_width, canvas_height,
    payload, payload_sha256, pixel_count, requested_pixel_count, skipped_pixel_count,
    request_payload_sha256, undo_of_operation_id
  ) values (
    p_room_id, v_next_revision, p_operation_id, v_user_id, p_client_id,
    p_kind::collab_v1.operation_kind, v_room.structure_epoch, 1,
    p_canvas_id, p_frame_id, p_layer_id, p_canvas_width, p_canvas_height,
    v_actual_payload, v_actual_digest, v_applied_count, v_requested_count, v_skipped_count,
    v_request_digest, p_undo_of_operation_id
  );

  -- The operation row is the authoritative agreement.  Only after it exists
  -- do we publish its next writer stamps; both branches retain cell ordering.
  if not v_is_guard then
    for v_change in
      select * from collab_v1.decode_pixel_patch(
        p_payload, p_canvas_width::bigint * p_canvas_height::bigint, 0, false
      ) order by cell_index
    loop
      insert into collab_v1.writer_state (
        room_id, canvas_id, frame_id, layer_id, cell_index, pixel_value, writer_revision, updated_at
      ) values (
        p_room_id, p_canvas_id, p_frame_id, p_layer_id, v_change.cell_index,
        v_change.palette_value, v_next_revision, timezone('utc', now())
      ) on conflict (room_id, canvas_id, frame_id, layer_id, cell_index) do update
        set pixel_value = excluded.pixel_value, writer_revision = excluded.writer_revision, updated_at = excluded.updated_at;
    end loop;
  else
    for v_array_position in 1..coalesce(array_length(v_actual_indices, 1), 0) loop
      insert into collab_v1.writer_state (
        room_id, canvas_id, frame_id, layer_id, cell_index, pixel_value, writer_revision, updated_at
      ) values (
        p_room_id, p_canvas_id, p_frame_id, p_layer_id, v_actual_indices[v_array_position],
        v_actual_values[v_array_position], v_next_revision, timezone('utc', now())
      ) on conflict (room_id, canvas_id, frame_id, layer_id, cell_index) do update
        set pixel_value = excluded.pixel_value, writer_revision = excluded.writer_revision, updated_at = excluded.updated_at;
    end loop;

    insert into collab_v1.operation_guard_audits (
      room_id, operation_id, revision, actor_user_id, kind, source_operation_id,
      requested_pixel_count, applied_pixel_count, skipped_pixel_count,
      request_payload_sha256, applied_payload_sha256
    ) values (
      p_room_id, p_operation_id, v_next_revision, v_user_id, p_kind::collab_v1.operation_kind,
      p_undo_of_operation_id, v_requested_count, v_applied_count, v_skipped_count,
      v_request_digest, v_actual_digest
    );
  end if;

  update collab_v1.rooms
    set head_revision = v_next_revision, updated_at = timezone('utc', now())
    where id = p_room_id;

  return query select 'committed'::text, v_next_revision,
    encode(v_actual_payload, 'base64'), encode(v_actual_digest, 'hex'),
    v_applied_count, v_requested_count, v_skipped_count;
end;
$$;

revoke all on function public.pixisync_get_ops_since(uuid, bigint, integer) from public, anon;
revoke all on function public.pixisync_commit_operation(uuid, uuid, uuid, text, bigint, smallint, text, text, text, integer, integer, bytea, bytea, integer, uuid) from public, anon;
grant execute on function public.pixisync_get_ops_since(uuid, bigint, integer) to authenticated;
grant execute on function public.pixisync_commit_operation(uuid, uuid, uuid, text, bigint, smallint, text, text, text, integer, integer, bytea, bytea, integer, uuid) to authenticated;
