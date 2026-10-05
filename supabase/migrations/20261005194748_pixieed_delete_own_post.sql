alter table public.user_posts
  add column deleted_at timestamptz,
  add column delete_cleanup_completed_at timestamptz;

-- A NULL publication timestamp is the existing public-map visibility boundary.
alter table public.post_map_points
  alter column published_at drop not null;

drop policy if exists "authors can read their posts" on public.user_posts;
create policy "authors can read their posts"
  on public.user_posts
  for select
  to authenticated
  using (
    (select auth.uid()) = author_id
    and (deleted_at is null or delete_cleanup_completed_at is null)
  );

-- Owners can create a short-lived preview URL for their own private source image.
-- The exact path must still be present on a non-deleted row owned by the caller.
drop policy if exists "authors can read their quarantine images" on storage.objects;
create policy "authors can read their quarantine images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'post-quarantine'
    and exists (
      select 1 from public.user_posts post
      where post.author_id = (select auth.uid())
        and post.image_path = storage.objects.name
        and post.deleted_at is null
    )
  );

create function public.pixieed_delete_own_post(
  p_post_id uuid,
  p_verified_author_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_post public.user_posts%rowtype;
  v_point public.post_map_points%rowtype;
  v_puzzle public.user_post_puzzles%rowtype;
  v_storage jsonb := '[]'::jsonb;
  v_bucket text;
begin
  if p_post_id is null or p_verified_author_id is null then
    raise exception 'post_delete_identity_invalid' using errcode = '22023';
  end if;

  select * into v_post
  from public.user_posts
  where id = p_post_id
  for update;
  if not found or v_post.author_id <> p_verified_author_id then
    -- Keep the response indistinguishable for unknown IDs and another person's post.
    raise exception 'post_not_found' using errcode = 'P0002';
  end if;

  select * into v_point from public.post_map_points where post_id = p_post_id for update;
  select * into v_puzzle from public.user_post_puzzles where post_id = p_post_id for update;

  if v_post.image_path !~ ('^' || p_verified_author_id::text || '/' || p_post_id::text || '\.(png|webp)$') then
    raise exception 'post_asset_path_invalid' using errcode = '22023';
  end if;
  v_storage := v_storage || jsonb_build_array(jsonb_build_object('bucket','post-quarantine','path',v_post.image_path));

  if v_point.post_id is not null then
    if v_point.public_image_path !~ ('^' || p_post_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|webp)$') then
      raise exception 'post_asset_path_invalid' using errcode = '22023';
    end if;
    v_storage := v_storage || jsonb_build_array(jsonb_build_object('bucket','post-public','path',v_point.public_image_path));
  end if;

  if v_puzzle.post_id is not null and v_puzzle.changed_image_path is not null then
    if v_puzzle.review_state = 'approved' then
      v_bucket := 'post-public';
      if v_puzzle.changed_image_path !~ ('^' || p_post_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$') then
        raise exception 'post_asset_path_invalid' using errcode = '22023';
      end if;
    else
      v_bucket := 'post-quarantine';
      if v_puzzle.changed_image_path !~ ('^' || p_verified_author_id::text || '/' || p_post_id::text || '-changed\.png$') then
        raise exception 'post_asset_path_invalid' using errcode = '22023';
      end if;
    end if;
    v_storage := v_storage || jsonb_build_array(jsonb_build_object('bucket',v_bucket,'path',v_puzzle.changed_image_path));
  end if;

  if v_post.deleted_at is null then
    update public.user_posts
      set status = 'hidden', published_at = null, deleted_at = now(), updated_at = now()
      where id = p_post_id;
    if v_point.post_id is not null then
      update public.post_map_points set published_at = null where post_id = p_post_id;
    end if;
  end if;

  return jsonb_build_object('postId',p_post_id,'deleted',true,'storage',v_storage);
end;
$$;

revoke all on function public.pixieed_delete_own_post(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pixieed_delete_own_post(uuid, uuid) to service_role;

create function public.pixieed_complete_own_post_delete(
  p_post_id uuid,
  p_verified_author_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_post public.user_posts%rowtype;
begin
  if p_post_id is null or p_verified_author_id is null then
    raise exception 'post_delete_identity_invalid' using errcode = '22023';
  end if;
  select * into v_post from public.user_posts where id = p_post_id for update;
  if not found or v_post.author_id <> p_verified_author_id or v_post.deleted_at is null then
    raise exception 'post_not_found' using errcode = 'P0002';
  end if;
  update public.user_posts
    set delete_cleanup_completed_at = coalesce(delete_cleanup_completed_at, now()), updated_at = now()
    where id = p_post_id;
  return jsonb_build_object('postId',p_post_id,'deleted',true,'cleanupCompleted',true);
end;
$$;

revoke all on function public.pixieed_complete_own_post_delete(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pixieed_complete_own_post_delete(uuid, uuid) to service_role;
