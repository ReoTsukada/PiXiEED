-- PiXiSYNC V1 session lifecycle.
-- This migration remains unapplied until lifecycle E2E and the production gate pass.

alter table collab_v1.rooms
  drop constraint if exists rooms_status_check;
alter table collab_v1.rooms
  add constraint rooms_status_check
  check (status in ('initializing', 'active', 'archived'));

alter table collab_v1.rooms
  add column if not exists session_generation bigint not null default 1
  check (session_generation > 0);

create table collab_v1.session_initializations (
  room_id uuid primary key references collab_v1.rooms(id) on delete cascade,
  checkpoint_id uuid not null unique,
  storage_path text not null unique check (storage_path like 'rooms/%'),
  state_sha256 bytea not null check (octet_length(state_sha256) = 32),
  encoded_bytes integer not null check (encoded_bytes between 1 and 52428800),
  codec_version smallint not null check (codec_version = 1),
  created_at timestamptz not null default timezone('utc', now())
);

create table collab_v1.checkpoint_uploads (
  checkpoint_id uuid primary key,
  room_id uuid not null references collab_v1.rooms(id) on delete cascade,
  revision bigint not null check (revision >= 0),
  storage_path text not null unique check (storage_path like 'rooms/%'),
  state_sha256 bytea not null check (octet_length(state_sha256) = 32),
  encoded_bytes integer not null check (encoded_bytes between 1 and 52428800),
  codec_version smallint not null check (codec_version = 1),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  unique (room_id, revision)
);

create table collab_v1.room_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references collab_v1.rooms(id) on delete cascade,
  token_sha256 bytea not null unique check (octet_length(token_sha256) = 32),
  role collab_v1.member_role not null check (role in ('editor', 'viewer')),
  created_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  max_uses smallint not null default 1 check (max_uses between 1 and 16),
  use_count smallint not null default 0 check (use_count between 0 and max_uses),
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index pixisync_room_invites_active_room_idx
  on collab_v1.room_invites (room_id, expires_at)
  where revoked_at is null;
create index pixisync_room_invites_created_by_idx
  on collab_v1.room_invites (created_by);
create index pixisync_checkpoint_uploads_created_by_idx
  on collab_v1.checkpoint_uploads (created_by);

alter table collab_v1.session_initializations enable row level security;
alter table collab_v1.checkpoint_uploads enable row level security;
alter table collab_v1.room_invites enable row level security;
revoke all on collab_v1.session_initializations from public, anon, authenticated;
revoke all on collab_v1.checkpoint_uploads from public, anon, authenticated;
revoke all on collab_v1.room_invites from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('pixisync-checkpoints', 'pixisync-checkpoints', false, 52428800)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

create or replace function collab_v1.can_write_checkpoint_object(p_name text)
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
     and member.role = 'owner'
     and member.revoked_at is null
    where p_name like 'rooms/' || room.id::text || '/checkpoints/%'
      and room.status in ('initializing', 'active')
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
    where p_name like 'rooms/' || room.id::text || '/checkpoints/%'
      and room.status in ('active', 'archived')
  )
$$;

revoke all on function collab_v1.can_write_checkpoint_object(text) from public, anon;
revoke all on function collab_v1.can_read_checkpoint_object(text) from public, anon;
grant execute on function collab_v1.can_write_checkpoint_object(text) to authenticated;
grant execute on function collab_v1.can_read_checkpoint_object(text) to authenticated;

drop policy if exists pixisync_checkpoint_owner_insert on storage.objects;
create policy pixisync_checkpoint_owner_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'pixisync-checkpoints'
  and collab_v1.can_write_checkpoint_object(name)
);

drop policy if exists pixisync_checkpoint_owner_update on storage.objects;

drop policy if exists pixisync_checkpoint_member_read on storage.objects;
create policy pixisync_checkpoint_member_read
on storage.objects for select to authenticated
using (
  bucket_id = 'pixisync-checkpoints'
  and collab_v1.can_read_checkpoint_object(name)
);

drop function if exists public.pixisync_create_room(text);

create function public.pixisync_begin_session(
  p_title text,
  p_state_sha256 bytea,
  p_encoded_bytes integer,
  p_codec_version smallint default 1
)
returns table (
  room_id uuid,
  checkpoint_id uuid,
  storage_path text,
  status text,
  session_generation bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room_id uuid := gen_random_uuid();
  v_checkpoint_id uuid := gen_random_uuid();
  v_storage_path text;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;
  if octet_length(p_state_sha256) <> 32
     or p_encoded_bytes not between 1 and 52428800
     or p_codec_version <> 1 then
    raise exception 'invalid_checkpoint_shape';
  end if;
  v_storage_path := 'rooms/' || v_room_id::text || '/checkpoints/0/' || v_checkpoint_id::text || '.pxd';
  insert into collab_v1.rooms (id, owner_user_id, title, status)
  values (v_room_id, v_user_id, left(coalesce(p_title, ''), 120), 'initializing');
  insert into collab_v1.room_members (room_id, user_id, role)
  values (v_room_id, v_user_id, 'owner');
  insert into collab_v1.session_initializations (
    room_id, checkpoint_id, storage_path, state_sha256, encoded_bytes, codec_version
  ) values (
    v_room_id, v_checkpoint_id, v_storage_path, p_state_sha256, p_encoded_bytes, p_codec_version
  );
  return query
  select v_room_id, v_checkpoint_id, v_storage_path, 'initializing'::text, 1::bigint;
end
$$;

create function public.pixisync_activate_initial_checkpoint(p_room_id uuid)
returns table (
  room_id uuid,
  status text,
  head_revision bigint,
  active_checkpoint_id uuid,
  session_generation bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room collab_v1.rooms%rowtype;
  v_initialization collab_v1.session_initializations%rowtype;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select * into v_room from collab_v1.rooms where id = p_room_id for update;
  if not found or v_room.owner_user_id <> v_user_id then raise exception 'owner_required'; end if;
  if v_room.status = 'active' and v_room.active_checkpoint_id is not null then
    return query
    select v_room.id, v_room.status, v_room.head_revision, v_room.active_checkpoint_id, v_room.session_generation;
    return;
  end if;
  if v_room.status <> 'initializing' or v_room.head_revision <> 0 then
    raise exception 'initializing_room_required';
  end if;
  select * into v_initialization
  from collab_v1.session_initializations
  where session_initializations.room_id = p_room_id;
  if not found then raise exception 'initial_checkpoint_not_prepared'; end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'pixisync-checkpoints'
      and name = v_initialization.storage_path
  ) then
    raise exception 'initial_checkpoint_blob_missing';
  end if;
  insert into collab_v1.checkpoints (
    id, room_id, revision, structure_epoch, storage_path, state_sha256,
    encoded_bytes, codec_version, status, created_by
  ) values (
    v_initialization.checkpoint_id, p_room_id, 0, 0, v_initialization.storage_path,
    v_initialization.state_sha256, v_initialization.encoded_bytes,
    v_initialization.codec_version, 'verified', v_user_id
  );
  update collab_v1.rooms
  set active_checkpoint_id = v_initialization.checkpoint_id,
      status = 'active',
      updated_at = timezone('utc', now())
  where id = p_room_id
  returning * into v_room;
  delete from collab_v1.session_initializations as initialization
  where initialization.room_id = p_room_id;
  return query
  select v_room.id, v_room.status, v_room.head_revision, v_room.active_checkpoint_id, v_room.session_generation;
end
$$;

create function public.pixisync_create_invite(
  p_room_id uuid,
  p_role text default 'editor',
  p_expires_at timestamptz default (timezone('utc', now()) + interval '24 hours'),
  p_max_uses smallint default 1
)
returns table (
  invite_id uuid,
  invite_token text,
  role text,
  expires_at timestamptz,
  max_uses smallint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room collab_v1.rooms%rowtype;
  v_invite_id uuid := gen_random_uuid();
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_role not in ('editor', 'viewer')
     or p_expires_at <= timezone('utc', now())
     or p_expires_at > timezone('utc', now()) + interval '7 days'
     or p_max_uses not between 1 and 16 then
    raise exception 'invalid_invite';
  end if;
  select * into v_room from collab_v1.rooms where id = p_room_id for update;
  if not found or v_room.owner_user_id <> v_user_id or v_room.status <> 'active' then
    raise exception 'active_owner_required';
  end if;
  insert into collab_v1.room_invites (
    id, room_id, token_sha256, role, created_by, expires_at, max_uses
  ) values (
    v_invite_id, p_room_id, extensions.digest(v_token, 'sha256'),
    p_role::collab_v1.member_role, v_user_id, p_expires_at, p_max_uses
  );
  return query select v_invite_id, v_token, p_role, p_expires_at, p_max_uses;
end
$$;

create function public.pixisync_prepare_checkpoint(
  p_room_id uuid,
  p_checkpoint_id uuid,
  p_state_sha256 bytea,
  p_encoded_bytes integer,
  p_codec_version smallint default 1
)
returns table (
  checkpoint_id uuid,
  revision bigint,
  storage_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room collab_v1.rooms%rowtype;
  v_storage_path text;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_checkpoint_id is null
     or octet_length(p_state_sha256) <> 32
     or p_encoded_bytes not between 1 and 52428800
     or p_codec_version <> 1 then
    raise exception 'invalid_checkpoint_shape';
  end if;
  select * into v_room from collab_v1.rooms where id = p_room_id for update;
  if not found or v_room.owner_user_id <> v_user_id or v_room.status <> 'active' then
    raise exception 'active_owner_required';
  end if;
  v_storage_path := 'rooms/' || p_room_id::text || '/checkpoints/'
    || v_room.head_revision::text || '/' || p_checkpoint_id::text || '.pxd';
  insert into collab_v1.checkpoint_uploads (
    checkpoint_id, room_id, revision, storage_path, state_sha256,
    encoded_bytes, codec_version, created_by
  ) values (
    p_checkpoint_id, p_room_id, v_room.head_revision, v_storage_path,
    p_state_sha256, p_encoded_bytes, p_codec_version, v_user_id
  )
  on conflict on constraint checkpoint_uploads_room_id_revision_key do update
  set checkpoint_id = excluded.checkpoint_id,
      storage_path = excluded.storage_path,
      state_sha256 = excluded.state_sha256,
      encoded_bytes = excluded.encoded_bytes,
      codec_version = excluded.codec_version,
      created_by = excluded.created_by,
      created_at = timezone('utc', now());
  return query select p_checkpoint_id, v_room.head_revision, v_storage_path;
end
$$;

create function public.pixisync_register_checkpoint(p_room_id uuid, p_checkpoint_id uuid)
returns table (
  checkpoint_id uuid,
  revision bigint,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room collab_v1.rooms%rowtype;
  v_upload collab_v1.checkpoint_uploads%rowtype;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select * into v_room from collab_v1.rooms where id = p_room_id for update;
  if not found or v_room.owner_user_id <> v_user_id or v_room.status <> 'active' then
    raise exception 'active_owner_required';
  end if;
  select * into v_upload
  from collab_v1.checkpoint_uploads as upload
  where upload.room_id = p_room_id and upload.checkpoint_id = p_checkpoint_id
  for update;
  if not found or v_upload.revision <> v_room.head_revision then
    raise exception 'head_checkpoint_upload_required';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'pixisync-checkpoints'
      and name = v_upload.storage_path
  ) then
    raise exception 'checkpoint_blob_missing';
  end if;
  insert into collab_v1.checkpoints (
    id, room_id, revision, structure_epoch, storage_path, state_sha256,
    encoded_bytes, codec_version, status, created_by
  ) values (
    v_upload.checkpoint_id, p_room_id, v_upload.revision, v_room.structure_epoch,
    v_upload.storage_path, v_upload.state_sha256, v_upload.encoded_bytes,
    v_upload.codec_version, 'candidate', v_user_id
  );
  delete from collab_v1.checkpoint_uploads as upload
  where upload.checkpoint_id = p_checkpoint_id;
  return query select p_checkpoint_id, v_room.head_revision, 'candidate'::text;
end
$$;

create function public.pixisync_attest_checkpoint(
  p_checkpoint_id uuid,
  p_client_id uuid,
  p_state_sha256 bytea
)
returns table (
  checkpoint_id uuid,
  status text,
  attested_user_count integer,
  required_user_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_checkpoint collab_v1.checkpoints%rowtype;
  v_active_members integer;
  v_attested_users integer;
  v_required_users integer;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_client_id is null or octet_length(p_state_sha256) <> 32 then
    raise exception 'invalid_attestation';
  end if;
  select * into v_checkpoint
  from collab_v1.checkpoints as checkpoint
  where checkpoint.id = p_checkpoint_id
  for update;
  if not found or v_checkpoint.status not in ('candidate', 'verified') then
    raise exception 'checkpoint_not_attestable';
  end if;
  if v_checkpoint.state_sha256 <> p_state_sha256 then raise exception 'checkpoint_hash_mismatch'; end if;
  if not exists (
    select 1
    from collab_v1.rooms as room
    join collab_v1.room_members as member
      on member.room_id = room.id
     and member.user_id = v_user_id
     and member.revoked_at is null
    where room.id = v_checkpoint.room_id
      and room.status = 'active'
      and room.head_revision = v_checkpoint.revision
  ) then
    raise exception 'active_member_at_head_required';
  end if;
  insert into collab_v1.checkpoint_attestations (
    checkpoint_id, user_id, client_id, state_sha256
  ) values (
    p_checkpoint_id, v_user_id, p_client_id, p_state_sha256
  )
  on conflict on constraint checkpoint_attestations_pkey do update
  set state_sha256 = excluded.state_sha256,
      verified_at = timezone('utc', now());
  select count(*)::integer into v_active_members
  from collab_v1.room_members
  where room_id = v_checkpoint.room_id and revoked_at is null;
  v_required_users := least(2, greatest(1, v_active_members));
  select count(distinct user_id)::integer into v_attested_users
  from collab_v1.checkpoint_attestations as attestation
  where attestation.checkpoint_id = p_checkpoint_id
    and attestation.state_sha256 = p_state_sha256;
  if v_attested_users >= v_required_users then
    update collab_v1.checkpoints
    set status = 'verified'
    where id = p_checkpoint_id;
  end if;
  return query
  select p_checkpoint_id,
         case when v_attested_users >= v_required_users then 'verified' else 'candidate' end,
         v_attested_users,
         v_required_users;
end
$$;

create function public.pixisync_join_session(p_invite_token text)
returns table (
  room_id uuid,
  role text,
  can_edit boolean,
  status text,
  head_revision bigint,
  session_generation bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite collab_v1.room_invites%rowtype;
  v_room collab_v1.rooms%rowtype;
  v_member collab_v1.room_members%rowtype;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_invite_token !~ '^[0-9a-f]{64}$' then raise exception 'invalid_invite_token'; end if;
  select * into v_invite
  from collab_v1.room_invites
  where token_sha256 = extensions.digest(p_invite_token, 'sha256')
  for update;
  if not found then raise exception 'invite_unavailable'; end if;
  select * into v_room from collab_v1.rooms where id = v_invite.room_id for update;
  if not found or v_room.status <> 'active' or v_room.active_checkpoint_id is null then
    raise exception 'room_not_active';
  end if;
  select * into v_member
  from collab_v1.room_members as member
  where member.room_id = v_room.id and member.user_id = v_user_id
  for update;
  if found then
    if v_member.revoked_at is not null then raise exception 'membership_revoked'; end if;
  else
    if v_invite.revoked_at is not null
       or v_invite.expires_at <= timezone('utc', now())
       or v_invite.use_count >= v_invite.max_uses then
      raise exception 'invite_unavailable';
    end if;
    insert into collab_v1.room_members (room_id, user_id, role)
    values (v_room.id, v_user_id, v_invite.role);
    v_member.role := v_invite.role;
    update collab_v1.room_invites
    set use_count = use_count + 1
    where id = v_invite.id;
  end if;
  return query
  select v_room.id, v_member.role::text, v_member.role in ('owner', 'editor'),
         v_room.status, v_room.head_revision, v_room.session_generation;
end
$$;

create function public.pixisync_open_session(p_room_id uuid)
returns table (
  room_id uuid,
  status text,
  role text,
  can_edit boolean,
  head_revision bigint,
  structure_epoch bigint,
  session_generation bigint,
  checkpoint_id uuid,
  checkpoint_revision bigint,
  storage_path text,
  state_sha256_hex text,
  encoded_bytes integer,
  codec_version smallint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  return query
  select room.id, room.status, member.role::text, member.role in ('owner', 'editor'),
         room.head_revision, room.structure_epoch, room.session_generation,
         checkpoint.id, checkpoint.revision, checkpoint.storage_path,
         encode(checkpoint.state_sha256, 'hex'), checkpoint.encoded_bytes, checkpoint.codec_version
  from collab_v1.rooms as room
  join collab_v1.room_members as member
    on member.room_id = room.id
   and member.user_id = auth.uid()
   and member.revoked_at is null
  join collab_v1.checkpoints as checkpoint
    on checkpoint.id = room.active_checkpoint_id
   and checkpoint.room_id = room.id
   and checkpoint.status = 'verified'
   and checkpoint.revision <= room.head_revision
  where room.id = p_room_id
    and room.status = 'active';
  if not found then raise exception 'active_session_not_available'; end if;
end
$$;

create function public.pixisync_leave_session(p_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room collab_v1.rooms%rowtype;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select * into v_room from collab_v1.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'active' then raise exception 'room_not_active'; end if;
  if v_room.owner_user_id = v_user_id then raise exception 'owner_must_archive'; end if;
  update collab_v1.room_members
  set revoked_at = timezone('utc', now())
  where room_id = p_room_id and user_id = v_user_id and revoked_at is null;
  if not found then raise exception 'active_membership_required'; end if;
  return true;
end
$$;

create function public.pixisync_archive_session(p_room_id uuid, p_final_checkpoint_id uuid)
returns table (
  status text,
  head_revision bigint,
  active_checkpoint_id uuid,
  session_generation bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room collab_v1.rooms%rowtype;
  v_checkpoint collab_v1.checkpoints%rowtype;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select * into v_room from collab_v1.rooms where id = p_room_id for update;
  if not found or v_room.owner_user_id <> v_user_id or v_room.status <> 'active' then
    raise exception 'active_owner_required';
  end if;
  select * into v_checkpoint
  from collab_v1.checkpoints
  where id = p_final_checkpoint_id and room_id = p_room_id
  for update;
  if not found or v_checkpoint.status <> 'verified' or v_checkpoint.revision <> v_room.head_revision then
    raise exception 'verified_head_checkpoint_required';
  end if;
  update collab_v1.rooms as room
  set status = 'archived',
      active_checkpoint_id = p_final_checkpoint_id,
      session_generation = room.session_generation + 1,
      updated_at = timezone('utc', now())
  where room.id = p_room_id
  returning * into v_room;
  return query
  select v_room.status, v_room.head_revision, v_room.active_checkpoint_id, v_room.session_generation;
end
$$;

revoke all on function public.pixisync_begin_session(text, bytea, integer, smallint) from public, anon;
revoke all on function public.pixisync_activate_initial_checkpoint(uuid) from public, anon;
revoke all on function public.pixisync_create_invite(uuid, text, timestamptz, smallint) from public, anon;
revoke all on function public.pixisync_prepare_checkpoint(uuid, uuid, bytea, integer, smallint) from public, anon;
revoke all on function public.pixisync_register_checkpoint(uuid, uuid) from public, anon;
revoke all on function public.pixisync_attest_checkpoint(uuid, uuid, bytea) from public, anon;
revoke all on function public.pixisync_join_session(text) from public, anon;
revoke all on function public.pixisync_open_session(uuid) from public, anon;
revoke all on function public.pixisync_leave_session(uuid) from public, anon;
revoke all on function public.pixisync_archive_session(uuid, uuid) from public, anon;

grant execute on function public.pixisync_begin_session(text, bytea, integer, smallint) to authenticated;
grant execute on function public.pixisync_activate_initial_checkpoint(uuid) to authenticated;
grant execute on function public.pixisync_create_invite(uuid, text, timestamptz, smallint) to authenticated;
grant execute on function public.pixisync_prepare_checkpoint(uuid, uuid, bytea, integer, smallint) to authenticated;
grant execute on function public.pixisync_register_checkpoint(uuid, uuid) to authenticated;
grant execute on function public.pixisync_attest_checkpoint(uuid, uuid, bytea) to authenticated;
grant execute on function public.pixisync_join_session(text) to authenticated;
grant execute on function public.pixisync_open_session(uuid) to authenticated;
grant execute on function public.pixisync_leave_session(uuid) to authenticated;
grant execute on function public.pixisync_archive_session(uuid, uuid) to authenticated;
