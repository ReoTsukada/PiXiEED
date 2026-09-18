-- Public map visibility checks the parent post without granting public table
-- access to user_posts. The helper exposes only a boolean result.
create or replace function public.pixieed_map_post_is_published(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_posts post
    where post.id = p_post_id
      and post.status = 'published'
      and post.published_at is not null
  );
$$;

revoke all on function public.pixieed_map_post_is_published(uuid) from public;
grant execute on function public.pixieed_map_post_is_published(uuid) to anon, authenticated;

drop policy if exists "published map points are public" on public.post_map_points;

create policy "published map points are public"
  on public.post_map_points
  for select
  to anon, authenticated
  using (
    published_at is not null
    and public.pixieed_map_post_is_published(post_id)
  );
