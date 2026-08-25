-- Persist the lightweight work classification and explicit reuse permissions
-- separately from the existing social/market distribution mode.
alter table public.social_posts
  add column if not exists content_kind text not null default 'finished',
  add column if not exists download_allowed boolean not null default false,
  add column if not exists commercial_use_allowed boolean not null default false,
  add column if not exists redistribution_allowed boolean not null default false,
  add column if not exists credit_required boolean not null default false,
  add column if not exists attribution_text text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.social_posts'::regclass
      and conname = 'social_posts_content_kind_check'
  ) then
    alter table public.social_posts
      add constraint social_posts_content_kind_check
      check (content_kind in ('finished', 'wip', 'material', 'game'));
  end if;
end;
$$;

update public.social_posts
set download_allowed = (distribution_mode = 'free')
where distribution_mode = 'free' and download_allowed = false;

create index if not exists social_posts_content_kind_feed_idx
  on public.social_posts(content_kind, status, published_at desc, id desc);

drop function if exists public.social_create_image_post_v2(text, text, text[], text, text, boolean, boolean);

create or replace function public.social_create_image_post_v2(
  input_title text,
  input_caption text,
  input_tags text[],
  input_object_path text,
  input_distribution_mode text default 'showcase',
  input_derivative_allowed boolean default false,
  input_comments_enabled boolean default true,
  input_content_kind text default 'finished'
)
returns uuid language plpgsql security definer set search_path = public, storage as $$
declare
  v_user_id uuid := auth.uid();
  v_path text := btrim(coalesce(input_object_path, ''));
  v_title text := btrim(coalesce(input_title, ''));
  v_caption text := btrim(coalesce(input_caption, ''));
  v_distribution text := lower(btrim(coalesce(input_distribution_mode, 'showcase')));
  v_content_kind text := lower(btrim(coalesce(input_content_kind, 'finished')));
  v_tags text[];
  v_name text;
  v_avatar text;
  v_post_id uuid;
begin
  if v_user_id is null then raise exception 'login required'; end if;
  if char_length(v_title) not between 1 and 50 then raise exception 'title must be between 1 and 50 characters'; end if;
  if char_length(v_caption) > 300 then raise exception 'caption is too long'; end if;
  if v_distribution not in ('showcase', 'free') then raise exception 'invalid distribution mode'; end if;
  if v_content_kind not in ('finished', 'wip', 'material', 'game') then raise exception 'invalid content kind'; end if;
  select coalesce(array_agg(tag order by ordinal), array[]::text[]) into v_tags
  from (
    select min(ordinal) ordinal, left(btrim(value), 24) tag
    from unnest(coalesce(input_tags, array[]::text[])) with ordinality item(value, ordinal)
    where btrim(value) <> ''
    group by left(btrim(value), 24)
    order by min(ordinal)
    limit 5
  ) normalized;
  if v_path = '' or v_path not like (v_user_id::text || '/%') then raise exception 'invalid social media path'; end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'social-posts' and object.name = v_path and object.owner_id = v_user_id::text
  ) then raise exception 'uploaded social media was not found'; end if;

  select coalesce(nullif(left(btrim(profile.nickname), 40), ''), 'PiXiEEDクリエイター'),
    coalesce(nullif(left(btrim(profile.avatar), 240), ''), 'mao')
  into v_name, v_avatar from public.user_profiles profile where profile.id = v_user_id;

  insert into public.social_posts (
    post_kind, content_kind, distribution_mode, creator_user_id, creator_display_name, creator_avatar,
    title, caption, tags, media_object_path, download_allowed, derivative_allowed, comments_enabled
  ) values (
    'image', v_content_kind, v_distribution, v_user_id, coalesce(v_name, 'PiXiEEDクリエイター'), coalesce(v_avatar, 'mao'),
    v_title, v_caption, v_tags, v_path, v_distribution = 'free',
    v_distribution = 'free' and coalesce(input_derivative_allowed, false), coalesce(input_comments_enabled, true)
  ) returning id into v_post_id;
  return v_post_id;
end;
$$;
revoke all on function public.social_create_image_post_v2(text, text, text[], text, text, boolean, boolean, text)
  from public, anon, authenticated;
grant execute on function public.social_create_image_post_v2(text, text, text[], text, text, boolean, boolean, text)
  to authenticated;

create or replace function public.social_public_feed_v1(input_limit integer default 120)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(feed.entry order by feed.published_at desc, feed.id desc), '[]'::jsonb)
  from (
    select post.id, post.published_at,
      jsonb_build_object(
        'id', post.id, 'post_kind', post.post_kind, 'content_kind', post.content_kind,
        'distribution_mode', post.distribution_mode, 'creator_display_name', post.creator_display_name,
        'creator_avatar', post.creator_avatar, 'media_object_path', post.media_object_path,
        'source_thumbnail_url', post.source_thumbnail_url, 'market_asset_id', post.market_asset_id,
        'pixfind_puzzle_id', post.pixfind_puzzle_id, 'like_count', post.like_count,
        'liked_by_me', exists (select 1 from public.social_post_likes reaction
          where reaction.post_id = post.id and reaction.user_id = auth.uid()),
        'published_at', post.published_at
      ) as entry
    from public.social_posts post
    where post.status = 'published'
    order by post.published_at desc, post.id desc
    limit least(greatest(coalesce(input_limit, 120), 1), 120)
  ) feed;
$$;
revoke all on function public.social_public_feed_v1(integer) from public, anon, authenticated;
grant execute on function public.social_public_feed_v1(integer) to anon, authenticated;

create or replace function public.social_public_post_v1(input_post_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', post.id, 'post_kind', post.post_kind, 'content_kind', post.content_kind,
    'distribution_mode', post.distribution_mode, 'creator_is_me', post.creator_user_id = auth.uid(),
    'creator_display_name', post.creator_display_name, 'creator_avatar', post.creator_avatar,
    'title', post.title, 'caption', post.caption, 'tags', post.tags,
    'media_object_path', post.media_object_path, 'source_thumbnail_url', post.source_thumbnail_url,
    'market_asset_id', post.market_asset_id, 'pixfind_puzzle_id', post.pixfind_puzzle_id,
    'download_allowed', post.download_allowed, 'derivative_allowed', post.derivative_allowed,
    'commercial_use_allowed', post.commercial_use_allowed, 'redistribution_allowed', post.redistribution_allowed,
    'credit_required', post.credit_required, 'attribution_text', post.attribution_text,
    'comments_enabled', post.comments_enabled, 'comment_count', post.comment_count,
    'sale_price_yen', market.sale_price_yen, 'like_count', post.like_count,
    'liked_by_me', exists (select 1 from public.social_post_likes reaction
      where reaction.post_id = post.id and reaction.user_id = auth.uid()),
    'published_at', post.published_at
  )
  from public.social_posts post
  left join public.market_assets market on market.id = post.market_asset_id
  where post.id = input_post_id and post.status = 'published';
$$;
revoke all on function public.social_public_post_v1(uuid) from public, anon, authenticated;
grant execute on function public.social_public_post_v1(uuid) to anon, authenticated;
