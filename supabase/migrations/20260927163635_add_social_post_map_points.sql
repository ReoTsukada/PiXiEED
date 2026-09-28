-- Let the verified owner place a legacy showcase image on the globe.
-- Store only the coarse globe cell; the source image remains in social_posts.

create table public.social_post_map_points (
  social_post_id uuid primary key
    references public.social_posts(id) on delete cascade,
  globe_cell_id text not null,
  projection_version text not null,
  globe_band integer not null,
  globe_column integer not null,
  constraint social_post_map_points_cell_valid check (
    projection_version = 'v11-meridian-parallel-quarter-degree'
    and globe_cell_id = 'globe:' || projection_version || ':' || globe_band || ':' || globe_column
    and globe_band between 0 and 719
    and globe_column between 0 and 1439
  )
);

create index social_post_map_points_cell_idx
  on public.social_post_map_points (projection_version, globe_band, globe_column);

alter table public.social_post_map_points enable row level security;

-- The source post must remain an eligible public showcase image.
create policy "published showcase map points are public"
  on public.social_post_map_points
  for select
  to anon, authenticated
  using (exists (
    select 1
    from public.social_posts post
    where post.id = social_post_map_points.social_post_id
      and post.status = 'published'
      and post.post_kind = 'image'
      and post.distribution_mode = 'showcase'
      and post.media_object_path is not null
  ));

-- Only the authenticated creator can place or edit their eligible image.
create policy "authors can add their own showcase map points"
  on public.social_post_map_points
  for insert
  to authenticated
  with check (exists (
    select 1
    from public.social_posts post
    where post.id = social_post_map_points.social_post_id
      and post.creator_user_id = (select auth.uid())
      and post.status = 'published'
      and post.post_kind = 'image'
      and post.distribution_mode = 'showcase'
      and post.media_object_path is not null
  ));

create policy "authors can update their own showcase map points"
  on public.social_post_map_points
  for update
  to authenticated
  using (exists (
    select 1
    from public.social_posts post
    where post.id = social_post_map_points.social_post_id
      and post.creator_user_id = (select auth.uid())
      and post.status = 'published'
      and post.post_kind = 'image'
      and post.distribution_mode = 'showcase'
      and post.media_object_path is not null
  ))
  with check (exists (
    select 1
    from public.social_posts post
    where post.id = social_post_map_points.social_post_id
      and post.creator_user_id = (select auth.uid())
      and post.status = 'published'
      and post.post_kind = 'image'
      and post.distribution_mode = 'showcase'
      and post.media_object_path is not null
  ));

create policy "authors can delete their own showcase map points"
  on public.social_post_map_points
  for delete
  to authenticated
  using (exists (
    select 1
    from public.social_posts post
    where post.id = social_post_map_points.social_post_id
      and post.creator_user_id = (select auth.uid())
      and post.status = 'published'
      and post.post_kind = 'image'
      and post.distribution_mode = 'showcase'
      and post.media_object_path is not null
  ));

revoke all on table public.social_post_map_points from public, anon, authenticated;
grant select on table public.social_post_map_points to anon, authenticated;
grant insert, update, delete on table public.social_post_map_points to authenticated;
