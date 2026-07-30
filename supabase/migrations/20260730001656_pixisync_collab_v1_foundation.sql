-- PiXiSYNC V1 is intentionally isolated from the retired shared_project tables.
create extension if not exists pgcrypto with schema extensions;

create schema if not exists collab_v1;
revoke all on schema collab_v1 from public, anon, authenticated;

do $$ begin
  create type collab_v1.member_role as enum ('owner', 'editor', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type collab_v1.operation_kind as enum ('pixel_patch', 'undo_pixel_patch', 'redo_pixel_patch');
exception when duplicate_object then null; end $$;

create table if not exists collab_v1.rooms (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  document_schema_version smallint not null default 1 check (document_schema_version = 1),
  head_revision bigint not null default 0 check (head_revision >= 0),
  structure_epoch bigint not null default 0 check (structure_epoch >= 0),
  active_checkpoint_id uuid,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists collab_v1.room_members (
  room_id uuid not null references collab_v1.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role collab_v1.member_role not null,
  joined_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz,
  primary key (room_id, user_id)
);

create table if not exists collab_v1.operations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references collab_v1.rooms(id) on delete cascade,
  revision bigint not null check (revision > 0),
  operation_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_client_id uuid not null,
  kind collab_v1.operation_kind not null,
  structure_epoch bigint not null check (structure_epoch >= 0),
  codec_version smallint not null check (codec_version = 1),
  payload bytea not null check (octet_length(payload) between 7 and 49152),
  payload_sha256 bytea not null check (octet_length(payload_sha256) = 32),
  pixel_count integer not null check (pixel_count between 1 and 8192),
  undo_of_operation_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  unique (room_id, revision),
  unique (room_id, operation_id)
);
create index if not exists pixisync_operations_room_revision_idx on collab_v1.operations (room_id, revision);

create table if not exists collab_v1.checkpoints (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references collab_v1.rooms(id) on delete cascade,
  revision bigint not null check (revision >= 0),
  structure_epoch bigint not null check (structure_epoch >= 0),
  storage_path text not null unique check (storage_path like 'rooms/%'),
  state_sha256 bytea not null check (octet_length(state_sha256) = 32),
  encoded_bytes integer not null check (encoded_bytes between 1 and 52428800),
  codec_version smallint not null check (codec_version = 1),
  status text not null check (status in ('candidate', 'verified', 'superseded')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  unique (room_id, revision)
);

create table if not exists collab_v1.checkpoint_attestations (
  checkpoint_id uuid not null references collab_v1.checkpoints(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null,
  state_sha256 bytea not null check (octet_length(state_sha256) = 32),
  verified_at timestamptz not null default timezone('utc', now()),
  primary key (checkpoint_id, user_id, client_id)
);

alter table collab_v1.rooms drop constraint if exists pixisync_rooms_active_checkpoint_fk;
alter table collab_v1.rooms add constraint pixisync_rooms_active_checkpoint_fk
  foreign key (active_checkpoint_id) references collab_v1.checkpoints(id) on delete set null;

create table if not exists collab_v1.rate_windows (
  room_id uuid not null references collab_v1.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  operation_count integer not null default 0 check (operation_count >= 0),
  primary key (room_id, user_id)
);

alter table collab_v1.rooms enable row level security;
alter table collab_v1.room_members enable row level security;
alter table collab_v1.operations enable row level security;
alter table collab_v1.checkpoints enable row level security;
alter table collab_v1.checkpoint_attestations enable row level security;
alter table collab_v1.rate_windows enable row level security;

revoke all on all tables in schema collab_v1 from public, anon, authenticated;
revoke all on all sequences in schema collab_v1 from public, anon, authenticated;
