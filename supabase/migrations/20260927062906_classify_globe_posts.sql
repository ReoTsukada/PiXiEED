-- Legacy posts remain in the hand-authored category. New camera posts carry
-- their disclosed capture method through moderation to the public gallery.
alter table public.user_posts
  add column post_kind text not null default 'pixel_art'
  check (post_kind in ('pixel_art', 'pixel_camera'));

alter table public.post_map_points
  add column post_kind text not null default 'pixel_art'
  check (post_kind in ('pixel_art', 'pixel_camera'));
