-- Existing records keep their recorded colour counts; new submissions are
-- restricted to 128 colours in create-post. Widen only the pixel dimensions.
alter table public.user_posts
  drop constraint if exists user_posts_image_width_check,
  drop constraint if exists user_posts_image_height_check;

alter table public.user_posts
  add constraint user_posts_image_width_check check (image_width between 8 and 512),
  add constraint user_posts_image_height_check check (image_height between 8 and 512);
