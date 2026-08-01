-- Large raster writes are committed as one ordered operation backed by an
-- immutable private Storage object. Small edits continue to use pixel_patch.
--
-- Binary codec v1 (pixel_format = indexed-mask-v1):
--   4-byte magic "PXRA", u8 version, u8 flags,
--   u16le x, u16le y, u16le width, u16le height, u32le changed count,
--   ceil(width * height / 8) mask bytes,
--   then one final uint8 palette index for every set mask bit.

create table collab_v1.raster_region_uploads (
  upload_id uuid primary key,
  room_id uuid not null references collab_v1.rooms(id) on delete cascade,
  actor_client_id uuid not null,
  base_revision bigint not null check (base_revision >= 0),
  structure_epoch bigint not null check (structure_epoch >= 0),
  canvas_id text not null check (char_length(canvas_id) between 1 and 128),
  frame_id text not null check (char_length(frame_id) between 1 and 128),
  layer_id text not null check (char_length(layer_id) between 1 and 128),
  canvas_width integer not null check (canvas_width between 1 and 16384),
  canvas_height integer not null check (canvas_height between 1 and 16384),
  region_x integer not null check (region_x >= 0),
  region_y integer not null check (region_y >= 0),
  region_width integer not null check (region_width between 1 and 16384),
  region_height integer not null check (region_height between 1 and 16384),
  storage_path text not null unique,
  asset_sha256 bytea not null check (octet_length(asset_sha256) = 32),
  encoded_bytes integer not null check (encoded_bytes between 20 and 52428800),
  codec_version smallint not null check (codec_version = 1),
  pixel_format text not null check (pixel_format = 'indexed-mask-v1'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default (timezone('utc', now()) + interval '1 hour'),
  committed_revision bigint,
  cleanup_claimed_by uuid references auth.users(id) on delete restrict,
  cleanup_claimed_at timestamptz,
  check (canvas_width::bigint * canvas_height::bigint <= 268435456),
  check (region_x::bigint + region_width <= canvas_width),
  check (region_y::bigint + region_height <= canvas_height),
  check (
    encoded_bytes::bigint >= 19 + ((region_width::bigint * region_height + 7) / 8)
    and encoded_bytes::bigint <= 18 + ((region_width::bigint * region_height + 7) / 8)
      + region_width::bigint * region_height
  ),
  check (committed_revision is null or committed_revision = base_revision + 1)
);

create index pixisync_raster_region_uploads_stale_idx
  on collab_v1.raster_region_uploads (room_id, expires_at)
  where committed_revision is null;

alter table collab_v1.raster_region_uploads enable row level security;
revoke all on collab_v1.raster_region_uploads from public, anon, authenticated;

create function collab_v1.can_write_raster_region_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from collab_v1.raster_region_uploads as upload
    join collab_v1.rooms as room on room.id = upload.room_id
    join collab_v1.room_members as member
      on member.room_id = room.id
     and member.user_id = (select auth.uid())
     and member.role in ('owner', 'editor')
     and member.revoked_at is null
    where upload.created_by = (select auth.uid())
      and upload.storage_path = p_name
      and upload.committed_revision is null
      and upload.cleanup_claimed_at is null
      and upload.expires_at > timezone('utc', now())
      and room.status = 'active'
  )
$$;

create function collab_v1.can_delete_raster_region_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from collab_v1.raster_region_uploads as upload
    join collab_v1.room_members as member
      on member.room_id = upload.room_id
     and member.user_id = (select auth.uid())
     and member.role in ('owner', 'editor')
     and member.revoked_at is null
    where upload.storage_path = p_name
      and upload.committed_revision is null
      and upload.cleanup_claimed_by = (select auth.uid())
  )
$$;

-- The existing member-read policy delegates to this helper. Extending the
-- helper keeps one read policy for checkpoints and raster operation assets.
create or replace function collab_v1.can_read_checkpoint_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from collab_v1.rooms as room
    join collab_v1.room_members as member
      on member.room_id = room.id
     and member.user_id = (select auth.uid())
     and member.revoked_at is null
    where (
      p_name like 'rooms/' || room.id::text || '/checkpoints/%'
      or p_name like 'rooms/' || room.id::text || '/document-checkpoints/%'
      or p_name like 'rooms/' || room.id::text || '/raster-assets/%'
    )
      and room.status in ('active', 'archived')
  )
$$;

revoke all on function collab_v1.can_write_raster_region_object(text) from public, anon, authenticated;
grant execute on function collab_v1.can_write_raster_region_object(text) to authenticated;
revoke all on function collab_v1.can_delete_raster_region_object(text) from public, anon, authenticated;
grant execute on function collab_v1.can_delete_raster_region_object(text) to authenticated;
revoke all on function collab_v1.can_read_checkpoint_object(text) from public, anon, authenticated;
grant execute on function collab_v1.can_read_checkpoint_object(text) to authenticated;

drop policy if exists pixisync_raster_region_editor_insert on storage.objects;
create policy pixisync_raster_region_editor_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'pixisync-checkpoints'
  and name like 'rooms/%/raster-assets/%.pxra'
  and collab_v1.can_write_raster_region_object(name)
);

drop policy if exists pixisync_raster_region_editor_delete on storage.objects;
create policy pixisync_raster_region_editor_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'pixisync-checkpoints'
  and collab_v1.can_delete_raster_region_object(name)
);

create function public.pixisync_prepare_raster_region_upload(
  p_room_id uuid,
  p_upload_id uuid,
  p_client_id uuid,
  p_base_revision bigint,
  p_structure_epoch bigint,
  p_canvas_id text,
  p_frame_id text,
  p_layer_id text,
  p_canvas_width integer,
  p_canvas_height integer,
  p_x integer,
  p_y integer,
  p_width integer,
  p_height integer,
  p_asset_sha256 bytea,
  p_encoded_bytes integer,
  p_codec_version smallint default 1,
  p_pixel_format text default 'indexed-mask-v1'
)
returns table (upload_id uuid, storage_path text, base_revision bigint, structure_epoch bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room collab_v1.rooms%rowtype;
  v_role collab_v1.member_role;
  v_path text;
  v_existing collab_v1.raster_region_uploads%rowtype;
  v_area bigint;
  v_min_bytes bigint;
  v_max_bytes bigint;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  v_area := p_width::bigint * p_height::bigint;
  v_min_bytes := 19 + ((v_area + 7) / 8);
  v_max_bytes := 18 + ((v_area + 7) / 8) + v_area;
  if p_room_id is null or p_upload_id is null or p_client_id is null
     or p_base_revision is null or p_structure_epoch is null
     or p_canvas_width is null or p_canvas_height is null
     or p_x is null or p_y is null or p_width is null or p_height is null
     or p_asset_sha256 is null or p_encoded_bytes is null
     or p_codec_version is null or p_pixel_format is null
     or p_base_revision < 0 or p_structure_epoch < 0
     or char_length(coalesce(p_canvas_id, '')) not between 1 and 128
     or char_length(coalesce(p_frame_id, '')) not between 1 and 128
     or char_length(coalesce(p_layer_id, '')) not between 1 and 128
     or p_canvas_width not between 1 and 16384 or p_canvas_height not between 1 and 16384
     or p_canvas_width::bigint * p_canvas_height::bigint > 268435456
     or p_x < 0 or p_y < 0 or p_width not between 1 and 16384 or p_height not between 1 and 16384
     or p_x::bigint + p_width > p_canvas_width or p_y::bigint + p_height > p_canvas_height
     or octet_length(p_asset_sha256) <> 32
     or p_encoded_bytes not between 20 and 52428800
     or p_encoded_bytes::bigint not between v_min_bytes and v_max_bytes
     or p_codec_version <> 1 or p_pixel_format <> 'indexed-mask-v1' then
    raise exception 'invalid_raster_region_upload_shape';
  end if;

  select * into v_room from collab_v1.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'active' then raise exception 'room_not_active'; end if;
  select role into v_role from collab_v1.room_members
  where room_id = p_room_id and user_id = v_user_id and revoked_at is null;
  if v_role not in ('owner', 'editor') then raise exception 'not_editor'; end if;
  if p_base_revision <> v_room.head_revision then raise exception 'stale_base_revision'; end if;
  if p_structure_epoch <> v_room.structure_epoch then raise exception 'stale_structure_epoch'; end if;

  v_path := 'rooms/' || p_room_id::text || '/raster-assets/' || p_upload_id::text || '.pxra';
  select * into v_existing from collab_v1.raster_region_uploads as region_upload
  where region_upload.upload_id = p_upload_id for update;
  if found then
    if v_existing.room_id <> p_room_id or v_existing.created_by <> v_user_id
       or v_existing.actor_client_id <> p_client_id
       or v_existing.base_revision <> p_base_revision
       or v_existing.structure_epoch <> p_structure_epoch
       or v_existing.canvas_id <> p_canvas_id or v_existing.frame_id <> p_frame_id
       or v_existing.layer_id <> p_layer_id
       or v_existing.canvas_width <> p_canvas_width or v_existing.canvas_height <> p_canvas_height
       or v_existing.region_x <> p_x or v_existing.region_y <> p_y
       or v_existing.region_width <> p_width or v_existing.region_height <> p_height
       or v_existing.storage_path <> v_path or v_existing.asset_sha256 <> p_asset_sha256
       or v_existing.encoded_bytes <> p_encoded_bytes
       or v_existing.codec_version <> p_codec_version or v_existing.pixel_format <> p_pixel_format
       or v_existing.committed_revision is not null or v_existing.cleanup_claimed_at is not null
       or v_existing.expires_at <= timezone('utc', now()) then
      raise exception 'raster_region_upload_id_conflict';
    end if;
    return query select v_existing.upload_id, v_existing.storage_path,
      v_existing.base_revision, v_existing.structure_epoch;
    return;
  end if;

  insert into collab_v1.raster_region_uploads (
    upload_id, room_id, actor_client_id, base_revision, structure_epoch,
    canvas_id, frame_id, layer_id, canvas_width, canvas_height,
    region_x, region_y, region_width, region_height, storage_path,
    asset_sha256, encoded_bytes, codec_version, pixel_format, created_by
  ) values (
    p_upload_id, p_room_id, p_client_id, p_base_revision, p_structure_epoch,
    p_canvas_id, p_frame_id, p_layer_id, p_canvas_width, p_canvas_height,
    p_x, p_y, p_width, p_height, v_path,
    p_asset_sha256, p_encoded_bytes, p_codec_version, p_pixel_format, v_user_id
  );
  return query select p_upload_id, v_path, p_base_revision, p_structure_epoch;
end
$$;

create function public.pixisync_abort_raster_region_upload(p_room_id uuid, p_upload_id uuid)
returns table (storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_upload collab_v1.raster_region_uploads%rowtype;
  v_role collab_v1.member_role;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select * into v_upload from collab_v1.raster_region_uploads
  where room_id = p_room_id and upload_id = p_upload_id for update;
  if not found then return; end if;
  select role into v_role from collab_v1.room_members
  where room_id = p_room_id and user_id = v_user_id and revoked_at is null;
  if v_upload.committed_revision is not null or v_role not in ('owner', 'editor')
     or (v_upload.created_by <> v_user_id and v_upload.expires_at > timezone('utc', now())) then
    raise exception 'raster_region_abort_forbidden';
  end if;
  update collab_v1.raster_region_uploads
  set cleanup_claimed_by = v_user_id, cleanup_claimed_at = timezone('utc', now())
  where upload_id = p_upload_id;
  return query select v_upload.storage_path;
end
$$;

create function public.pixisync_finalize_raster_region_upload_cleanup(p_room_id uuid, p_upload_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_upload collab_v1.raster_region_uploads%rowtype;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select * into v_upload from collab_v1.raster_region_uploads
  where room_id = p_room_id and upload_id = p_upload_id for update;
  if not found then return false; end if;
  if v_upload.committed_revision is not null or v_upload.cleanup_claimed_by <> v_user_id then
    raise exception 'raster_region_cleanup_forbidden';
  end if;
  if exists (
    select 1 from storage.objects
    where bucket_id = 'pixisync-checkpoints' and name = v_upload.storage_path
  ) then
    raise exception 'raster_region_blob_still_present';
  end if;
  delete from collab_v1.raster_region_uploads where upload_id = p_upload_id;
  return true;
end
$$;

create function public.pixisync_list_stale_raster_region_uploads(
  p_room_id uuid,
  p_limit integer default 16
)
returns table (upload_id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role collab_v1.member_role;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select role into v_role from collab_v1.room_members
  where room_id = p_room_id and user_id = v_user_id and revoked_at is null;
  if v_role not in ('owner', 'editor') then raise exception 'not_editor'; end if;
  return query
  select upload.upload_id, upload.storage_path
  from collab_v1.raster_region_uploads as upload
  where upload.room_id = p_room_id
    and upload.committed_revision is null
    and upload.expires_at <= timezone('utc', now())
    and (
      upload.cleanup_claimed_at is null
      or upload.cleanup_claimed_at <= timezone('utc', now()) - interval '5 minutes'
    )
  order by upload.expires_at
  limit least(greatest(coalesce(p_limit, 16), 1), 100);
end
$$;

-- Add the region operation without loosening any prior document operation.
alter function collab_v1.validate_document_operation(jsonb)
  rename to validate_document_operation_before_raster_region;

create function collab_v1.validate_raster_region_set(p_document jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_asset jsonb := p_document->'asset';
  v_area bigint;
  v_min_bytes bigint;
  v_max_bytes bigint;
  v_key text;
begin
  if jsonb_typeof(p_document) <> 'object'
     or p_document->>'version' <> '1'
     or p_document->>'type' <> 'raster_region_set'
     or (select count(*) from jsonb_object_keys(p_document)) <> 12
     or not (p_document ?& array[
       'version','type','canvasId','frameId','layerId','canvasWidth','canvasHeight',
       'x','y','width','height','asset'
     ]) then
    raise exception 'invalid_raster_region_operation';
  end if;
  for v_key in select jsonb_object_keys(p_document) loop
    if v_key <> all(array[
      'version','type','canvasId','frameId','layerId','canvasWidth','canvasHeight',
      'x','y','width','height','asset'
    ]) then raise exception 'unknown_raster_region_key'; end if;
  end loop;
  if jsonb_typeof(p_document->'canvasId') <> 'string'
     or jsonb_typeof(p_document->'frameId') <> 'string'
     or jsonb_typeof(p_document->'layerId') <> 'string'
     or char_length(p_document->>'canvasId') not between 1 and 128
     or char_length(p_document->>'frameId') not between 1 and 128
     or char_length(p_document->>'layerId') not between 1 and 128
     or jsonb_typeof(p_document->'canvasWidth') <> 'number'
     or jsonb_typeof(p_document->'canvasHeight') <> 'number'
     or jsonb_typeof(p_document->'x') <> 'number'
     or jsonb_typeof(p_document->'y') <> 'number'
     or jsonb_typeof(p_document->'width') <> 'number'
     or jsonb_typeof(p_document->'height') <> 'number'
     or (p_document->>'canvasWidth')::numeric <> trunc((p_document->>'canvasWidth')::numeric)
     or (p_document->>'canvasHeight')::numeric <> trunc((p_document->>'canvasHeight')::numeric)
     or (p_document->>'x')::numeric <> trunc((p_document->>'x')::numeric)
     or (p_document->>'y')::numeric <> trunc((p_document->>'y')::numeric)
     or (p_document->>'width')::numeric <> trunc((p_document->>'width')::numeric)
     or (p_document->>'height')::numeric <> trunc((p_document->>'height')::numeric)
     or (p_document->>'canvasWidth')::integer not between 1 and 16384
     or (p_document->>'canvasHeight')::integer not between 1 and 16384
     or (p_document->>'canvasWidth')::bigint * (p_document->>'canvasHeight')::bigint > 268435456
     or (p_document->>'x')::integer < 0 or (p_document->>'y')::integer < 0
     or (p_document->>'width')::integer not between 1 and 16384
     or (p_document->>'height')::integer not between 1 and 16384
     or (p_document->>'x')::bigint + (p_document->>'width')::bigint > (p_document->>'canvasWidth')::bigint
     or (p_document->>'y')::bigint + (p_document->>'height')::bigint > (p_document->>'canvasHeight')::bigint then
    raise exception 'invalid_raster_region_target';
  end if;
  if jsonb_typeof(v_asset) <> 'object'
     or (select count(*) from jsonb_object_keys(v_asset)) <> 5
     or not (v_asset ?& array['objectPath','sha256Hex','byteLength','codecVersion','pixelFormat'])
     or jsonb_typeof(v_asset->'objectPath') <> 'string'
     or v_asset->>'objectPath' !~ '^rooms/[0-9a-f-]{36}/raster-assets/[0-9a-f-]{36}\.pxra$'
     or jsonb_typeof(v_asset->'sha256Hex') <> 'string'
     or v_asset->>'sha256Hex' !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(v_asset->'byteLength') <> 'number'
     or (v_asset->>'byteLength')::numeric <> trunc((v_asset->>'byteLength')::numeric)
     or (v_asset->>'byteLength')::integer not between 20 and 52428800
     or jsonb_typeof(v_asset->'codecVersion') <> 'number'
     or (v_asset->>'codecVersion')::integer <> 1
     or jsonb_typeof(v_asset->'pixelFormat') <> 'string'
     or v_asset->>'pixelFormat' <> 'indexed-mask-v1' then
    raise exception 'invalid_raster_region_asset';
  end if;
  v_area := (p_document->>'width')::bigint * (p_document->>'height')::bigint;
  v_min_bytes := 19 + ((v_area + 7) / 8);
  v_max_bytes := 18 + ((v_area + 7) / 8) + v_area;
  if (v_asset->>'byteLength')::bigint not between v_min_bytes and v_max_bytes then
    raise exception 'invalid_raster_region_asset_size';
  end if;
  return 'raster_region_set';
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'invalid_raster_region_operation_value';
end
$$;

create function collab_v1.validate_document_operation(p_document jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(p_document) = 'object' and p_document->>'type' = 'raster_region_set' then
    return collab_v1.validate_raster_region_set(p_document);
  end if;
  return collab_v1.validate_document_operation_before_raster_region(p_document);
end
$$;

revoke all on function collab_v1.validate_document_operation_before_raster_region(jsonb) from public, anon, authenticated;
revoke all on function collab_v1.validate_raster_region_set(jsonb) from public, anon, authenticated;
revoke all on function collab_v1.validate_document_operation(jsonb) from public, anon, authenticated;

-- Raster region operations are document_patch rows so they share the same
-- gap-free revision log and advance structure_epoch as an atomic raster
-- barrier. This rejects small pixel writes from clients that have not yet
-- received the region and therefore hold stale Undo before-values.
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
  v_is_raster_region boolean;
  v_canvas_id text;
  v_frame_id text;
  v_layer_id text;
  v_canvas_width integer;
  v_canvas_height integer;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_operation_id is null or p_client_id is null or p_base_revision < 0 or p_structure_epoch < 0
     or octet_length(p_payload) not between 2 and 262144 or octet_length(p_payload_sha256) <> 32 then
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
    perform collab_v1.validate_document_operation(v_document);
  exception when others then
    raise exception 'invalid_document_operation_json';
  end;
  v_is_raster_region := v_document->>'type' = 'raster_region_set';
  v_canvas_id := case when v_is_raster_region then v_document->>'canvasId' else '__document__' end;
  v_frame_id := case when v_is_raster_region then v_document->>'frameId' else '__document__' end;
  v_layer_id := case when v_is_raster_region then v_document->>'layerId' else '__document__' end;
  v_canvas_width := case when v_is_raster_region then (v_document->>'canvasWidth')::integer else 1 end;
  v_canvas_height := case when v_is_raster_region then (v_document->>'canvasHeight')::integer else 1 end;

  select * into v_existing from collab_v1.operations
  where room_id = p_room_id and operation_id = p_operation_id;
  if found then
    if v_existing.actor_user_id <> v_user_id or v_existing.actor_client_id <> p_client_id
       or v_existing.kind <> 'document_patch' or v_existing.codec_version <> 2
       or v_existing.pixel_count <> 0 or v_existing.requested_pixel_count <> 0
       or v_existing.payload_sha256 <> v_digest
       or v_existing.canvas_id <> v_canvas_id or v_existing.frame_id <> v_frame_id
       or v_existing.layer_id <> v_layer_id
       or v_existing.canvas_width <> v_canvas_width or v_existing.canvas_height <> v_canvas_height then
      raise exception 'operation_id_conflict';
    end if;
    return query select 'duplicate'::text, v_existing.revision, v_existing.structure_epoch,
      encode(v_existing.payload, 'base64'), encode(v_existing.payload_sha256, 'hex'),
      v_existing.pixel_count, v_existing.requested_pixel_count, v_existing.skipped_pixel_count;
    return;
  end if;
  if p_base_revision <> v_room.head_revision then raise exception 'stale_base_revision'; end if;
  if p_structure_epoch <> v_room.structure_epoch then raise exception 'stale_structure_epoch'; end if;
  if v_room.head_revision >= 9223372036854775806
     or v_room.structure_epoch >= 9223372036854775806 then
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
    v_next_epoch, 2, v_canvas_id, v_frame_id, v_layer_id, v_canvas_width, v_canvas_height,
    p_payload, v_digest, 0, 0, 0, v_digest, null
  );
  update collab_v1.rooms
  set head_revision = v_next_revision, structure_epoch = v_next_epoch,
      updated_at = timezone('utc', now())
  where id = p_room_id;
  return query select 'committed'::text, v_next_revision, v_next_epoch,
    encode(p_payload, 'base64'), encode(v_digest, 'hex'), 0, 0, 0;
end
$$;

-- Recreate the existing asset guard so the new validator and reservation are
-- bound on warm PostgREST connections. Storage metadata is read-only here:
-- the upload itself and all deletion still go through the Storage API.
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
  v_region collab_v1.raster_region_uploads%rowtype;
  v_storage_size bigint;
  v_storage_owner text;
  v_storage_sha256 text;
begin
  if new.kind <> 'document_patch' or new.codec_version <> 2 then return new; end if;
  begin v_document := convert_from(new.payload, 'utf8')::jsonb;
  exception when others then return new; end;

  if v_document->>'type' = 'raster_region_set' then
    v_asset := v_document->'asset';
    select * into v_region from collab_v1.raster_region_uploads
    where room_id = new.room_id and storage_path = v_asset->>'objectPath' for update;
    if not found
       or v_asset->>'objectPath' !~ ('^rooms/' || new.room_id::text || '/raster-assets/[0-9a-f-]{36}\.pxra$')
       or v_region.upload_id <> new.operation_id
       or v_region.created_by <> new.actor_user_id
       or v_region.actor_client_id <> new.actor_client_id
       or v_region.base_revision <> new.revision - 1
       or v_region.structure_epoch <> new.structure_epoch - 1
       or v_region.canvas_id <> new.canvas_id or v_region.frame_id <> new.frame_id
       or v_region.layer_id <> new.layer_id
       or v_region.canvas_width <> new.canvas_width or v_region.canvas_height <> new.canvas_height
       or v_region.canvas_id <> v_document->>'canvasId'
       or v_region.frame_id <> v_document->>'frameId'
       or v_region.layer_id <> v_document->>'layerId'
       or v_region.canvas_width <> (v_document->>'canvasWidth')::integer
       or v_region.canvas_height <> (v_document->>'canvasHeight')::integer
       or v_region.region_x <> (v_document->>'x')::integer
       or v_region.region_y <> (v_document->>'y')::integer
       or v_region.region_width <> (v_document->>'width')::integer
       or v_region.region_height <> (v_document->>'height')::integer
       or v_region.storage_path <> v_asset->>'objectPath'
       or encode(v_region.asset_sha256, 'hex') <> v_asset->>'sha256Hex'
       or v_region.encoded_bytes <> (v_asset->>'byteLength')::integer
       or v_region.codec_version <> (v_asset->>'codecVersion')::smallint
       or v_region.pixel_format <> v_asset->>'pixelFormat'
       or v_region.committed_revision is not null
       or v_region.cleanup_claimed_at is not null
       or v_region.expires_at <= timezone('utc', now()) then
      raise exception 'invalid_raster_region_upload';
    end if;
    select (object.metadata->>'size')::bigint, object.owner_id,
      object.user_metadata->>'sha256Hex'
    into v_storage_size, v_storage_owner, v_storage_sha256
    from storage.objects as object
    where object.bucket_id = 'pixisync-checkpoints'
      and object.name = v_region.storage_path;
    if not found or v_storage_size is distinct from v_region.encoded_bytes::bigint
       or v_storage_owner is distinct from v_region.created_by::text
       or v_storage_sha256 is distinct from encode(v_region.asset_sha256, 'hex') then
      raise exception 'raster_region_blob_verification_failed';
    end if;
    update collab_v1.raster_region_uploads
    set committed_revision = new.revision
    where upload_id = v_region.upload_id;

    -- Old per-cell writer stamps inside the replaced bounds could otherwise
    -- authorize a later guarded undo over this newer region write. Removing
    -- only the affected target/bounds is conservative and avoids a full-canvas
    -- writer-state reset.
    delete from collab_v1.writer_state
    where room_id = new.room_id
      and canvas_id = v_region.canvas_id and frame_id = v_region.frame_id
      and layer_id = v_region.layer_id
      and cell_index between
        v_region.region_y * v_region.canvas_width + v_region.region_x
        and (v_region.region_y + v_region.region_height - 1) * v_region.canvas_width
          + v_region.region_x + v_region.region_width - 1
      and cell_index / v_region.canvas_width between
        v_region.region_y and v_region.region_y + v_region.region_height - 1
      and cell_index % v_region.canvas_width between
        v_region.region_x and v_region.region_x + v_region.region_width - 1;
    return new;
  end if;

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
    if not exists (
      select 1 from storage.objects
      where bucket_id = 'pixisync-checkpoints' and name = v_upload.storage_path
    ) then raise exception 'document_checkpoint_blob_missing'; end if;
    if v_upload.committed_revision is null then
      update collab_v1.document_checkpoint_uploads
      set committed_revision = new.revision where upload_id = v_upload.upload_id;
    end if;
  end if;
  if v_document->>'type' = 'checkpoint_restore' then
    delete from collab_v1.writer_state where room_id = new.room_id;
  elsif v_document->>'type' = 'structure_delta' then
    delete from collab_v1.writer_state
    where room_id = new.room_id and canvas_id = v_document#>>'{data,canvasId}';
  end if;
  return new;
end
$$;

revoke all on function collab_v1.guard_document_checkpoint_operation() from public, anon, authenticated;
revoke all on function public.pixisync_prepare_raster_region_upload(
  uuid, uuid, uuid, bigint, bigint, text, text, text, integer, integer,
  integer, integer, integer, integer, bytea, integer, smallint, text
) from public, anon, authenticated;
grant execute on function public.pixisync_prepare_raster_region_upload(
  uuid, uuid, uuid, bigint, bigint, text, text, text, integer, integer,
  integer, integer, integer, integer, bytea, integer, smallint, text
) to authenticated;
revoke all on function public.pixisync_abort_raster_region_upload(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pixisync_abort_raster_region_upload(uuid, uuid) to authenticated;
revoke all on function public.pixisync_finalize_raster_region_upload_cleanup(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pixisync_finalize_raster_region_upload_cleanup(uuid, uuid) to authenticated;
revoke all on function public.pixisync_list_stale_raster_region_uploads(uuid, integer) from public, anon, authenticated;
grant execute on function public.pixisync_list_stale_raster_region_uploads(uuid, integer) to authenticated;
revoke all on function public.pixisync_commit_document_operation(
  uuid, uuid, uuid, bigint, bigint, bytea, bytea
) from public, anon, authenticated;
grant execute on function public.pixisync_commit_document_operation(
  uuid, uuid, uuid, bigint, bigint, bytea, bytea
) to authenticated;
