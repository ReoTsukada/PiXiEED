-- Raster-affecting document mutations use an immutable full-state object
-- referenced by the existing ordered document_patch operation. This staging
-- lifecycle is intentionally separate from archival checkpoints.

create table collab_v1.document_checkpoint_uploads (
  upload_id uuid primary key,
  room_id uuid not null references collab_v1.rooms(id) on delete cascade,
  actor_client_id uuid not null,
  base_revision bigint not null check (base_revision >= 0),
  structure_epoch bigint not null check (structure_epoch >= 0),
  storage_path text not null unique,
  state_sha256 bytea not null check (octet_length(state_sha256) = 32),
  encoded_bytes integer not null check (encoded_bytes between 1 and 52428800),
  codec_version smallint not null check (codec_version = 1),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default (timezone('utc', now()) + interval '1 hour'),
  committed_revision bigint,
  cleanup_claimed_by uuid references auth.users(id) on delete restrict,
  cleanup_claimed_at timestamptz,
  check (committed_revision is null or committed_revision = base_revision + 1)
);

create index pixisync_document_checkpoint_uploads_stale_idx
  on collab_v1.document_checkpoint_uploads (room_id, expires_at)
  where committed_revision is null;

alter table collab_v1.document_checkpoint_uploads enable row level security;
revoke all on collab_v1.document_checkpoint_uploads from public, anon, authenticated;

create or replace function collab_v1.can_write_checkpoint_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (
      select 1
      from collab_v1.rooms as room
      join collab_v1.room_members as member
        on member.room_id = room.id
       and member.user_id = auth.uid()
       and member.role = 'owner'
       and member.revoked_at is null
      where p_name like 'rooms/' || room.id::text || '/checkpoints/%'
        and room.status in ('initializing', 'active')
    )
    or exists (
      select 1
      from collab_v1.document_checkpoint_uploads as upload
      join collab_v1.rooms as room on room.id = upload.room_id
      join collab_v1.room_members as member
        on member.room_id = room.id
       and member.user_id = auth.uid()
       and member.role in ('owner', 'editor')
       and member.revoked_at is null
      where upload.created_by = auth.uid()
        and upload.storage_path = p_name
        and upload.committed_revision is null
        and upload.expires_at > timezone('utc', now())
        and room.status = 'active'
    )
  )
$$;

create or replace function collab_v1.can_read_checkpoint_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from collab_v1.rooms as room
    join collab_v1.room_members as member
      on member.room_id = room.id
     and member.user_id = auth.uid()
     and member.revoked_at is null
    where (
      p_name like 'rooms/' || room.id::text || '/checkpoints/%'
      or p_name like 'rooms/' || room.id::text || '/document-checkpoints/%'
    )
      and room.status in ('active', 'archived')
  )
$$;

create or replace function collab_v1.can_delete_document_checkpoint_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from collab_v1.document_checkpoint_uploads as upload
    join collab_v1.rooms as room on room.id = upload.room_id
    join collab_v1.room_members as member
      on member.room_id = room.id
     and member.user_id = auth.uid()
     and member.role in ('owner', 'editor')
     and member.revoked_at is null
    where upload.storage_path = p_name
      and upload.committed_revision is null
      and upload.cleanup_claimed_by = auth.uid()
  )
$$;

revoke all on function collab_v1.can_write_checkpoint_object(text) from public, anon;
grant execute on function collab_v1.can_write_checkpoint_object(text) to authenticated;
revoke all on function collab_v1.can_read_checkpoint_object(text) from public, anon;
grant execute on function collab_v1.can_read_checkpoint_object(text) to authenticated;
revoke all on function collab_v1.can_delete_document_checkpoint_object(text) from public, anon;
grant execute on function collab_v1.can_delete_document_checkpoint_object(text) to authenticated;

drop policy if exists pixisync_document_checkpoint_editor_insert on storage.objects;
create policy pixisync_document_checkpoint_editor_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'pixisync-checkpoints'
  and name like 'rooms/%/document-checkpoints/%'
  and collab_v1.can_write_checkpoint_object(name)
);

drop policy if exists pixisync_document_checkpoint_editor_delete on storage.objects;
create policy pixisync_document_checkpoint_editor_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'pixisync-checkpoints'
  and collab_v1.can_delete_document_checkpoint_object(name)
);

create function public.pixisync_prepare_document_checkpoint_upload(
  p_room_id uuid,
  p_upload_id uuid,
  p_client_id uuid,
  p_base_revision bigint,
  p_structure_epoch bigint,
  p_state_sha256 bytea,
  p_encoded_bytes integer,
  p_codec_version smallint default 1
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
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_upload_id is null or p_client_id is null
     or p_base_revision < 0 or p_structure_epoch < 0
     or octet_length(p_state_sha256) <> 32
     or p_encoded_bytes not between 1 and 52428800
     or p_codec_version <> 1 then
    raise exception 'invalid_document_checkpoint_shape';
  end if;
  select * into v_room from collab_v1.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'active' then raise exception 'room_not_active'; end if;
  select role into v_role from collab_v1.room_members
  where room_id = p_room_id and user_id = v_user_id and revoked_at is null;
  if v_role not in ('owner', 'editor') then raise exception 'not_editor'; end if;
  if p_base_revision <> v_room.head_revision then raise exception 'stale_base_revision'; end if;
  if p_structure_epoch <> v_room.structure_epoch then raise exception 'stale_structure_epoch'; end if;
  v_path := 'rooms/' || p_room_id::text || '/document-checkpoints/' || p_upload_id::text || '.pxd';
  insert into collab_v1.document_checkpoint_uploads (
    upload_id, room_id, actor_client_id, base_revision, structure_epoch,
    storage_path, state_sha256, encoded_bytes, codec_version, created_by
  ) values (
    p_upload_id, p_room_id, p_client_id, p_base_revision, p_structure_epoch,
    v_path, p_state_sha256, p_encoded_bytes, p_codec_version, v_user_id
  );
  return query select p_upload_id, v_path, p_base_revision, p_structure_epoch;
end
$$;

create function public.pixisync_abort_document_checkpoint_upload(p_room_id uuid, p_upload_id uuid)
returns table (storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_upload collab_v1.document_checkpoint_uploads%rowtype;
  v_role collab_v1.member_role;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select * into v_upload from collab_v1.document_checkpoint_uploads
  where room_id = p_room_id and upload_id = p_upload_id for update;
  if not found then return; end if;
  select role into v_role from collab_v1.room_members
  where room_id = p_room_id and user_id = v_user_id and revoked_at is null;
  if v_upload.committed_revision is not null
     or v_role not in ('owner', 'editor')
     or (v_upload.created_by <> v_user_id and v_upload.expires_at > timezone('utc', now())) then
    raise exception 'document_checkpoint_abort_forbidden';
  end if;
  update collab_v1.document_checkpoint_uploads
  set cleanup_claimed_by = v_user_id,
      cleanup_claimed_at = timezone('utc', now())
  where upload_id = p_upload_id;
  return query select v_upload.storage_path;
end
$$;

create function public.pixisync_finalize_document_checkpoint_upload_cleanup(p_room_id uuid, p_upload_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_upload collab_v1.document_checkpoint_uploads%rowtype;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select * into v_upload from collab_v1.document_checkpoint_uploads
  where room_id = p_room_id and upload_id = p_upload_id for update;
  if not found then return false; end if;
  if v_upload.committed_revision is not null
     or v_upload.cleanup_claimed_by <> v_user_id then
    raise exception 'document_checkpoint_cleanup_forbidden';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'pixisync-checkpoints' and name = v_upload.storage_path) then
    raise exception 'document_checkpoint_blob_still_present';
  end if;
  delete from collab_v1.document_checkpoint_uploads where upload_id = p_upload_id;
  return true;
end
$$;

create function public.pixisync_list_stale_document_checkpoint_uploads(p_room_id uuid, p_limit integer default 16)
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
  from collab_v1.document_checkpoint_uploads as upload
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

create function collab_v1.guard_document_checkpoint_operation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document jsonb;
  v_upload collab_v1.document_checkpoint_uploads%rowtype;
begin
  if new.kind <> 'document_patch' or new.codec_version <> 2 then return new; end if;
  begin
    v_document := convert_from(new.payload, 'utf8')::jsonb;
  exception when others then
    return new;
  end;
  if v_document->>'type' <> 'checkpoint_restore' then return new; end if;
  select * into v_upload
  from collab_v1.document_checkpoint_uploads
  where room_id = new.room_id
    and storage_path = v_document->>'objectPath'
  for update;
  if not found
     or v_upload.storage_path <> v_document->>'objectPath'
     or encode(v_upload.state_sha256, 'hex') <> v_document->>'sha256Hex'
     or v_upload.encoded_bytes <> (v_document->>'byteLength')::integer
     or (
       v_upload.committed_revision is null
       and (
         v_upload.cleanup_claimed_at is not null
         or
         v_upload.upload_id <> new.operation_id
         or v_upload.created_by <> new.actor_user_id
         or v_upload.actor_client_id <> new.actor_client_id
         or v_upload.base_revision <> new.revision - 1
         or v_upload.structure_epoch <> new.structure_epoch - 1
         or v_upload.expires_at <= timezone('utc', now())
       )
     ) then
    raise exception 'invalid_document_checkpoint_upload';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'pixisync-checkpoints' and name = v_upload.storage_path
  ) then
    raise exception 'document_checkpoint_blob_missing';
  end if;
  if v_upload.committed_revision is null then
    update collab_v1.document_checkpoint_uploads
    set committed_revision = new.revision
    where upload_id = v_upload.upload_id;
  end if;
  return new;
end
$$;

revoke all on function collab_v1.guard_document_checkpoint_operation() from public, anon, authenticated;

drop trigger if exists pixisync_guard_document_checkpoint_operation on collab_v1.operations;
create trigger pixisync_guard_document_checkpoint_operation
before insert on collab_v1.operations
for each row execute function collab_v1.guard_document_checkpoint_operation();

revoke all on function public.pixisync_prepare_document_checkpoint_upload(
  uuid, uuid, uuid, bigint, bigint, bytea, integer, smallint
) from public, anon;
grant execute on function public.pixisync_prepare_document_checkpoint_upload(
  uuid, uuid, uuid, bigint, bigint, bytea, integer, smallint
) to authenticated;
revoke all on function public.pixisync_abort_document_checkpoint_upload(uuid, uuid) from public, anon;
grant execute on function public.pixisync_abort_document_checkpoint_upload(uuid, uuid) to authenticated;
revoke all on function public.pixisync_finalize_document_checkpoint_upload_cleanup(uuid, uuid) from public, anon;
grant execute on function public.pixisync_finalize_document_checkpoint_upload_cleanup(uuid, uuid) to authenticated;
revoke all on function public.pixisync_list_stale_document_checkpoint_uploads(uuid, integer) from public, anon;
grant execute on function public.pixisync_list_stale_document_checkpoint_uploads(uuid, integer) to authenticated;
