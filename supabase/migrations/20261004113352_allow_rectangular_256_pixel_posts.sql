-- New map posts may use any rectangular image from 1x1 through 256x256.
-- Keep the table envelope at 1..512 so existing 257..512px posts remain
-- readable and moderators can continue changing their review status.
alter table public.user_posts
  drop constraint if exists user_posts_image_width_check,
  drop constraint if exists user_posts_image_height_check;

alter table public.user_posts
  add constraint user_posts_image_width_check check (image_width between 1 and 512),
  add constraint user_posts_image_height_check check (image_height between 1 and 512);

-- Restrict only new records and image replacements. The trigger does not run
-- for moderation-only updates, so historical images above 256px remain editable.
create or replace function public.enforce_new_pixel_post_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.image_mime is distinct from 'image/png'
    or new.image_width not between 1 and 256
    or new.image_height not between 1 and 256
    or new.image_bytes not between 1 and 524288
    or new.color_count is null
    or new.color_count not between 1 and 128 then
    raise exception 'new pixel posts must use PNG, 1-256 px per edge, 512 KB, and 1-128 colours'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- The production database may not have the earlier trigger migration. Ensure
-- this policy is actually attached to new images and image replacements.
drop trigger if exists enforce_new_pixel_post_limits on public.user_posts;
create trigger enforce_new_pixel_post_limits
before insert or update of image_path, image_mime, image_bytes, image_width, image_height, color_count
on public.user_posts
for each row execute function public.enforce_new_pixel_post_limits();

-- The local completion RPC is optional on deployed environments. Where it is
-- installed, change only its ordinary-post bounds and fail closed if its body
-- no longer matches the reviewed contract. Puzzle/image equality checks remain
-- untouched. CREATE OR REPLACE preserves the function's existing ACL and owner.
do $$
declare
  completion_fn regprocedure := to_regprocedure('public.pixieed_create_post(jsonb,jsonb,jsonb)');
  definition text;
  old_check text := 'or v_post.image_width not between 8 and 512 or v_post.image_height not between 8 and 512';
  new_check text := 'or v_post.image_width not between 1 and 256 or v_post.image_height not between 1 and 256';
  occurrences integer;
begin
  if completion_fn is null then
    return;
  end if;

  definition := pg_get_functiondef(completion_fn);
  occurrences := (length(definition) - length(replace(definition, old_check, ''))) / length(old_check);
  if occurrences <> 1 then
    raise exception 'pixieed_create_post dimension guard changed; refusing an unreviewed replacement';
  end if;

  execute replace(definition, old_check, new_check);
end;
$$;
