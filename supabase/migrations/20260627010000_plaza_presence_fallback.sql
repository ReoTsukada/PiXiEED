create table if not exists public.plaza_presence (
  room_id text not null default 'main',
  presence_id text not null,
  client_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  display_name text,
  avatar text,
  x numeric(8,2),
  y numeric(8,2),
  bubble text check (bubble is null or char_length(bubble) <= 280),
  bubble_mode text not null default 'world' check (bubble_mode in ('world', 'direct', 'image')),
  bubble_target_name text,
  bubble_target_artwork_id text,
  bubble_until timestamptz,
  walking boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default (timezone('utc', now()) + interval '18 seconds'),
  primary key (room_id, presence_id),
  check (room_id = 'main'),
  check (char_length(presence_id) between 1 and 128),
  check (char_length(client_id) between 1 and 128),
  check (display_name is null or char_length(display_name) <= 32),
  check (avatar is null or char_length(avatar) <= 64),
  check (bubble_target_name is null or char_length(bubble_target_name) <= 32)
);

create index if not exists plaza_presence_room_expires_idx
  on public.plaza_presence (room_id, expires_at desc, updated_at desc);

alter table public.plaza_presence enable row level security;

drop policy if exists plaza_presence_select_live on public.plaza_presence;
create policy plaza_presence_select_live
on public.plaza_presence
for select
to anon, authenticated
using (
  room_id = 'main'
  and expires_at > timezone('utc', now())
);

drop policy if exists plaza_presence_insert_public on public.plaza_presence;
create policy plaza_presence_insert_public
on public.plaza_presence
for insert
to anon, authenticated
with check (
  room_id = 'main'
  and expires_at <= timezone('utc', now()) + interval '1 minute'
  and char_length(presence_id) between 1 and 128
  and char_length(client_id) between 1 and 128
);

drop policy if exists plaza_presence_update_public on public.plaza_presence;
create policy plaza_presence_update_public
on public.plaza_presence
for update
to anon, authenticated
using (room_id = 'main')
with check (
  room_id = 'main'
  and expires_at <= timezone('utc', now()) + interval '1 minute'
  and char_length(presence_id) between 1 and 128
  and char_length(client_id) between 1 and 128
);

do $$
begin
  alter publication supabase_realtime add table public.plaza_artworks;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.plaza_artwork_comments;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.plaza_presence;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
