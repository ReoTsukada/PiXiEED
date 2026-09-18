-- PiXiEED user-posting foundation
--
-- 公開サイトから見えるのは post_map_points の「公開セル」だけです。
-- 正確な緯度経度、投稿者ID、審査前画像は別領域に置き、
-- 受付は Edge Function 経由に限定します。

create extension if not exists pgcrypto;

do $$
begin
  create type public.post_status as enum ('pending', 'published', 'rejected', 'hidden');
exception
  when duplicate_object then null;
end $$;

create table public.user_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  caption text not null default '' check (char_length(caption) <= 180),
  image_path text not null check (image_path !~ '(^/|\.\.|\\\\)'),
  image_mime text not null check (image_mime in ('image/png', 'image/webp')),
  image_bytes integer not null check (image_bytes between 1 and 524288),
  image_width smallint not null check (image_width between 8 and 128),
  image_height smallint not null check (image_height between 8 and 128),
  color_count integer check (color_count is null or color_count between 1 and 512),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  status public.post_status not null default 'pending',
  moderation_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create unique index user_posts_content_hash_idx on public.user_posts (content_hash);
create index user_posts_author_created_idx on public.user_posts (author_id, created_at desc);
create index user_posts_status_created_idx on public.user_posts (status, created_at desc);

create table public.post_locations_private (
  post_id uuid primary key references public.user_posts(id) on delete cascade,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  source text not null check (source in ('device', 'map-cell')),
  map_space text not null default 'japan',
  cell_grid integer check (cell_grid is null or cell_grid in (64, 128, 256, 512)),
  cell_x integer,
  cell_y integer,
  prefecture_code text check (prefecture_code is null or prefecture_code ~ '^(0[1-9]|[1-4][0-9])$'),
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  constraint post_locations_coordinates_valid check (
    (latitude is null and longitude is null)
    or (latitude between -90 and 90 and longitude between -180 and 180)
  ),
  constraint post_locations_accuracy_valid check (accuracy_m is null or (accuracy_m >= 0 and accuracy_m <= 50000)),
  constraint post_locations_cell_valid check (
    (cell_grid is null and cell_x is null and cell_y is null)
    or (
      cell_grid is not null
      and cell_x between 0 and cell_grid - 1
      and cell_y between 0 and cell_grid - 1
    )
  )
);

-- 公開地図用の非正確データ。緯度経度とauthor_idは意図的に持たせない。
-- 審査・公開処理が完了した行だけをサービス側から作成する。
create table public.post_map_points (
  post_id uuid primary key references public.user_posts(id) on delete cascade,
  map_space text not null default 'japan',
  projection_version text not null default 'japan-cell-v1',
  cell_grid integer not null check (cell_grid in (64, 128, 256, 512)),
  cell_x integer not null,
  cell_y integer not null,
  prefecture_code text not null check (prefecture_code ~ '^(0[1-9]|[1-4][0-9])$'),
  title text not null check (char_length(title) between 1 and 60),
  caption text not null default '' check (char_length(caption) <= 180),
  public_image_path text not null check (public_image_path !~ '(^/|\.\.|\\\\)'),
  published_at timestamptz not null,
  constraint post_map_points_cell_valid check (
    cell_x between 0 and cell_grid - 1 and cell_y between 0 and cell_grid - 1
  )
);

create index post_map_points_prefecture_cell_idx
  on public.post_map_points (prefecture_code, cell_grid, cell_x, cell_y);
create index post_map_points_published_idx
  on public.post_map_points (published_at desc);

create table public.post_likes (
  post_id uuid not null references public.user_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index post_likes_user_id_idx on public.post_likes (user_id);

create table public.post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.user_posts(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('copyright', 'not-pixel-art', 'harmful', 'location', 'other')),
  details text not null default '' check (char_length(details) <= 500),
  created_at timestamptz not null default now()
);

create unique index post_reports_reporter_post_idx on public.post_reports (post_id, reporter_id);
create index post_reports_post_created_idx on public.post_reports (post_id, created_at desc);

-- 審査前は非公開、公開後だけ画像配信を許可する。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('post-quarantine', 'post-quarantine', false, 524288, array['image/png', 'image/webp']::text[]),
  ('post-public', 'post-public', true, 524288, array['image/png', 'image/webp']::text[])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.user_posts enable row level security;
alter table public.post_locations_private enable row level security;
alter table public.post_map_points enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_reports enable row level security;

-- ブラウザは公開セルだけを読める。審査前行・非公開行は存在自体を返さない。
create policy "published map points are public"
  on public.post_map_points
  for select
  to anon, authenticated
  using (published_at is not null);

-- 投稿者本人は自分の審査状態だけ確認できる。新規作成・審査更新はEdge Functionのみ。
create policy "authors can read their posts"
  on public.user_posts
  for select
  to authenticated
  using ((select auth.uid()) = author_id);

-- いいねは公開作品だけ。本人の行だけ作成・削除できる。
create policy "published posts can be liked"
  on public.post_likes
  for select
  to anon, authenticated
  using (exists (
    select 1
    from public.post_map_points point
    where point.post_id = post_likes.post_id
      and point.published_at is not null
  ));

create policy "users can add their own like"
  on public.post_likes
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.post_map_points point
      where point.post_id = post_likes.post_id
        and point.published_at is not null
    )
  );

create policy "users can remove their own like"
  on public.post_likes
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users can submit their own report"
  on public.post_reports
  for insert
  to authenticated
  with check ((select auth.uid()) = reporter_id);

-- 既定権限が緩い既存プロジェクトでも、受付経路をEdge Functionに限定する。
revoke all on table public.user_posts from anon, authenticated;
grant select on table public.user_posts to authenticated;
revoke all on table public.post_locations_private from anon, authenticated;
revoke all on table public.post_map_points from anon, authenticated;
grant select on table public.post_map_points to anon, authenticated;
revoke all on table public.post_likes from anon, authenticated;
grant select on table public.post_likes to anon;
grant select, insert, delete on table public.post_likes to authenticated;
revoke all on table public.post_reports from anon;
revoke all on table public.post_reports from authenticated;
grant insert on table public.post_reports to authenticated;

-- Storageへの直接アップロードは許可しない。受付Functionが検証後にquarantineへ保存する。
drop policy if exists "public post images are readable" on storage.objects;
create policy "public post images are readable"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'post-public');
