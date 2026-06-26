create extension if not exists pgcrypto;

create table if not exists public.plaza_rooms (
  id text primary key,
  name text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.plaza_rooms (id, name)
values ('main', 'PiXiEED 広場')
on conflict (id) do update
set name = excluded.name,
    updated_at = timezone('utc', now());

create table if not exists public.plaza_artworks (
  id uuid primary key default gen_random_uuid(),
  room_id text not null default 'main' references public.plaza_rooms(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  storage_path text not null,
  thumbnail_path text,
  image_url text,
  thumbnail_url text,
  title text not null default '無題',
  display_name text,
  avatar text,
  width integer,
  height integer,
  mime_type text,
  file_size integer,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default (timezone('utc', now()) + interval '24 hours'),
  deleted_at timestamptz,
  display_count integer not null default 0,
  last_displayed_at timestamptz,
  priority_until timestamptz,
  moderation_status text not null default 'visible' check (moderation_status in ('visible', 'hidden', 'review', 'deleted'))
);

create table if not exists public.plaza_artwork_comments (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references public.plaza_artworks(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  display_name text,
  avatar text,
  body text not null check (char_length(body) between 1 and 280),
  comment_type text not null default 'comment' check (comment_type in ('comment', 'gift', 'system')),
  is_paid boolean not null default false,
  gift_type text,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default (timezone('utc', now()) + interval '24 hours'),
  moderation_status text not null default 'visible' check (moderation_status in ('visible', 'hidden', 'review', 'deleted'))
);

create table if not exists public.plaza_reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('artwork', 'comment', 'user')),
  target_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default 'user_report',
  body text,
  created_at timestamptz not null default timezone('utc', now()),
  moderation_status text not null default 'open' check (moderation_status in ('open', 'reviewing', 'resolved', 'dismissed'))
);

create table if not exists public.plaza_blocks (
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);

create table if not exists public.plaza_user_avatars (
  user_id uuid primary key references auth.users(id) on delete cascade,
  avatar text,
  last_x numeric(5,2),
  last_y numeric(5,2),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists plaza_artworks_room_visible_idx
  on public.plaza_artworks (room_id, expires_at, created_at desc)
  where deleted_at is null and moderation_status = 'visible';

create index if not exists plaza_artworks_priority_idx
  on public.plaza_artworks (priority_until desc nulls last, created_at desc)
  where deleted_at is null and moderation_status = 'visible';

create index if not exists plaza_artworks_user_created_idx
  on public.plaza_artworks (user_id, created_at desc);

create index if not exists plaza_comments_artwork_created_idx
  on public.plaza_artwork_comments (artwork_id, created_at);

create index if not exists plaza_reports_status_idx
  on public.plaza_reports (moderation_status, created_at desc);

create or replace function public.plaza_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists plaza_rooms_touch_updated_at on public.plaza_rooms;
create trigger plaza_rooms_touch_updated_at
before update on public.plaza_rooms
for each row
execute function public.plaza_touch_updated_at();

drop trigger if exists plaza_user_avatars_touch_updated_at on public.plaza_user_avatars;
create trigger plaza_user_avatars_touch_updated_at
before update on public.plaza_user_avatars
for each row
execute function public.plaza_touch_updated_at();

alter table public.plaza_rooms enable row level security;
alter table public.plaza_artworks enable row level security;
alter table public.plaza_artwork_comments enable row level security;
alter table public.plaza_reports enable row level security;
alter table public.plaza_blocks enable row level security;
alter table public.plaza_user_avatars enable row level security;

drop policy if exists plaza_rooms_select_public on public.plaza_rooms;
create policy plaza_rooms_select_public
on public.plaza_rooms
for select
to anon, authenticated
using (true);

drop policy if exists plaza_artworks_select_visible on public.plaza_artworks;
create policy plaza_artworks_select_visible
on public.plaza_artworks
for select
to anon, authenticated
using (
  moderation_status = 'visible'
  and deleted_at is null
  and expires_at > timezone('utc', now())
);

drop policy if exists plaza_artworks_insert_own on public.plaza_artworks;
create policy plaza_artworks_insert_own
on public.plaza_artworks
for insert
to authenticated
with check (
  user_id = auth.uid()
  and room_id = 'main'
  and moderation_status = 'visible'
  and expires_at <= timezone('utc', now()) + interval '25 hours'
  and storage_path like 'plaza/%'
);

drop policy if exists plaza_artworks_update_own on public.plaza_artworks;
create policy plaza_artworks_update_own
on public.plaza_artworks
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists plaza_artworks_delete_own on public.plaza_artworks;
create policy plaza_artworks_delete_own
on public.plaza_artworks
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists plaza_comments_select_visible on public.plaza_artwork_comments;
create policy plaza_comments_select_visible
on public.plaza_artwork_comments
for select
to anon, authenticated
using (
  moderation_status = 'visible'
  and expires_at > timezone('utc', now())
  and exists (
    select 1
    from public.plaza_artworks as artworks
    where artworks.id = plaza_artwork_comments.artwork_id
      and artworks.moderation_status = 'visible'
      and artworks.deleted_at is null
      and artworks.expires_at > timezone('utc', now())
  )
);

drop policy if exists plaza_comments_insert_own on public.plaza_artwork_comments;
create policy plaza_comments_insert_own
on public.plaza_artwork_comments
for insert
to authenticated
with check (
  user_id = auth.uid()
  and moderation_status = 'visible'
  and char_length(body) between 1 and 280
  and exists (
    select 1
    from public.plaza_artworks as artworks
    where artworks.id = plaza_artwork_comments.artwork_id
      and artworks.moderation_status = 'visible'
      and artworks.deleted_at is null
      and artworks.expires_at > timezone('utc', now())
  )
);

drop policy if exists plaza_comments_update_own on public.plaza_artwork_comments;
create policy plaza_comments_update_own
on public.plaza_artwork_comments
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists plaza_reports_insert_own on public.plaza_reports;
create policy plaza_reports_insert_own
on public.plaza_reports
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists plaza_reports_select_own on public.plaza_reports;
create policy plaza_reports_select_own
on public.plaza_reports
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists plaza_blocks_select_own on public.plaza_blocks;
create policy plaza_blocks_select_own
on public.plaza_blocks
for select
to authenticated
using (blocker_user_id = auth.uid());

drop policy if exists plaza_blocks_insert_own on public.plaza_blocks;
create policy plaza_blocks_insert_own
on public.plaza_blocks
for insert
to authenticated
with check (blocker_user_id = auth.uid());

drop policy if exists plaza_blocks_delete_own on public.plaza_blocks;
create policy plaza_blocks_delete_own
on public.plaza_blocks
for delete
to authenticated
using (blocker_user_id = auth.uid());

drop policy if exists plaza_user_avatars_select_own on public.plaza_user_avatars;
create policy plaza_user_avatars_select_own
on public.plaza_user_avatars
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists plaza_user_avatars_upsert_own on public.plaza_user_avatars;
create policy plaza_user_avatars_upsert_own
on public.plaza_user_avatars
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists plaza_user_avatars_update_own on public.plaza_user_avatars;
create policy plaza_user_avatars_update_own
on public.plaza_user_avatars
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pixieed-contest',
  'pixieed-contest',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = true;

drop policy if exists plaza_storage_select_public on storage.objects;
create policy plaza_storage_select_public
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'pixieed-contest'
  and name like 'plaza/%'
);

drop policy if exists plaza_storage_insert_authenticated on storage.objects;
create policy plaza_storage_insert_authenticated
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'pixieed-contest'
  and name like 'plaza/%'
);

-- The new plaza page does not read legacy contest_entries records.
-- Physical cleanup of existing legacy posts and old storage objects should be run separately
-- after confirming no older PiXiEEDraw sharing route still depends on them.
