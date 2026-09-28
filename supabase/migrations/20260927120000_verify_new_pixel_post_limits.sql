-- Existing posts keep their recorded metadata. New image inserts and image
-- replacements must follow the same PNG/size/palette policy as create-post.
create or replace function public.enforce_new_pixel_post_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.image_mime <> 'image/png'
    or new.image_width not between 8 and 512
    or new.image_height not between 8 and 512
    or new.image_bytes not between 1 and 524288
    or new.color_count is null
    or new.color_count not between 1 and 128 then
    raise exception 'new pixel posts must use PNG, 8-512 px, 512 KB, and 1-128 colours'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_new_pixel_post_limits on public.user_posts;
create trigger enforce_new_pixel_post_limits
before insert or update of image_path, image_mime, image_bytes, image_width, image_height, color_count
on public.user_posts
for each row execute function public.enforce_new_pixel_post_limits();
