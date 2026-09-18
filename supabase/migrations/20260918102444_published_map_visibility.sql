-- 公開セルは、公開日時だけでなく親投稿の状態も確認してから返す。
-- 審査Functionが複数段階でStorage/DBを書き込んでも、pending行は公開されない。
drop policy if exists "published map points are public" on public.post_map_points;

create policy "published map points are public"
  on public.post_map_points
  for select
  to anon, authenticated
  using (
    published_at is not null
    and exists (
      select 1
      from public.user_posts post
      where post.id = post_map_points.post_id
        and post.status = 'published'
    )
  );
