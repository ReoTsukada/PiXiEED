-- Shared artwork feed for the PiXiEED home SNS.
-- Market favorites remain a commerce-oriented saved list; social likes are a
-- separate reaction shared by the home feed, image posts, and PiXFiND.

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  post_kind text not null check (post_kind in ('image', 'market', 'pixfind')),
  distribution_mode text not null default 'showcase'
    check (distribution_mode in ('showcase', 'free', 'paid', 'pixfind')),
  creator_user_id uuid references auth.users(id) on delete set null,
  creator_display_name text not null default 'PiXiEEDクリエイター'
    check (char_length(btrim(creator_display_name)) between 1 and 40),
  creator_avatar text not null default 'mao'
    check (char_length(creator_avatar) between 1 and 240),
  caption text not null default '' check (char_length(caption) <= 2000),
  media_object_path text,
  source_thumbnail_url text,
  market_asset_id uuid unique references public.market_assets(id) on delete cascade,
  pixfind_puzzle_id text unique references public.pixfind_puzzles(id) on delete cascade,
  derivative_allowed boolean not null default false,
  like_count integer not null default 0 check (like_count >= 0),
  status text not null default 'published' check (status in ('published', 'archived')),
  published_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    (post_kind = 'image' and media_object_path is not null and market_asset_id is null and pixfind_puzzle_id is null)
    or (post_kind = 'market' and market_asset_id is not null and pixfind_puzzle_id is null)
    or (post_kind = 'pixfind' and pixfind_puzzle_id is not null and market_asset_id is null)
  ),
  check (distribution_mode = 'free' or derivative_allowed = false)
);

create index if not exists social_posts_public_feed_idx
  on public.social_posts(status, published_at desc, id desc);
create index if not exists social_posts_creator_idx
  on public.social_posts(creator_user_id, published_at desc);

create table if not exists public.social_post_likes (
  post_id uuid not null references public.social_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (post_id, user_id)
);

create index if not exists social_post_likes_user_recent_idx
  on public.social_post_likes(user_id, created_at desc);

alter table public.social_posts enable row level security;
alter table public.social_post_likes enable row level security;

drop policy if exists social_posts_public_read on public.social_posts;
create policy social_posts_public_read
on public.social_posts for select to anon, authenticated
using (status = 'published' or creator_user_id = auth.uid());

drop policy if exists social_post_likes_read_own on public.social_post_likes;
create policy social_post_likes_read_own
on public.social_post_likes for select to authenticated
using (user_id = auth.uid());

revoke all on public.social_posts, public.social_post_likes from public, anon, authenticated;
grant select on public.social_posts to anon, authenticated;
grant select on public.social_post_likes to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'social-posts',
  'social-posts',
  true,
  10485760,
  array['image/png', 'image/webp', 'image/gif', 'image/jpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists social_posts_storage_read_public on storage.objects;
create policy social_posts_storage_read_public
on storage.objects for select to anon, authenticated
using (bucket_id = 'social-posts');

drop policy if exists social_posts_storage_insert_own on storage.objects;
create policy social_posts_storage_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'social-posts'
  and owner_id = auth.uid()::text
  and name like (auth.uid()::text || '/%')
);

drop policy if exists social_posts_storage_delete_own on storage.objects;
create policy social_posts_storage_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'social-posts'
  and owner_id = auth.uid()::text
  and name like (auth.uid()::text || '/%')
);

create or replace function public.social_touch_post_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists social_posts_touch_updated_at on public.social_posts;
create trigger social_posts_touch_updated_at
before update on public.social_posts
for each row execute function public.social_touch_post_updated_at();
revoke all on function public.social_touch_post_updated_at() from public, anon, authenticated;

create or replace function public.social_refresh_like_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_post_id uuid := case when tg_op = 'DELETE' then old.post_id else new.post_id end;
begin
  update public.social_posts
  set like_count = (
    select count(*)::integer from public.social_post_likes where post_id = v_post_id
  )
  where id = v_post_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists social_post_likes_refresh_count on public.social_post_likes;
create trigger social_post_likes_refresh_count
after insert or delete on public.social_post_likes
for each row execute function public.social_refresh_like_count();
revoke all on function public.social_refresh_like_count() from public, anon, authenticated;

create or replace function public.social_create_image_post_v1(
  input_caption text,
  input_object_path text,
  input_distribution_mode text default 'showcase',
  input_derivative_allowed boolean default false
)
returns uuid language plpgsql security definer set search_path = public, storage as $$
declare
  v_user_id uuid := auth.uid();
  v_path text := btrim(coalesce(input_object_path, ''));
  v_caption text := btrim(coalesce(input_caption, ''));
  v_distribution text := lower(btrim(coalesce(input_distribution_mode, 'showcase')));
  v_name text;
  v_avatar text;
  v_post_id uuid;
begin
  if v_user_id is null then raise exception 'login required'; end if;
  if char_length(v_caption) > 2000 then raise exception 'caption is too long'; end if;
  if v_distribution not in ('showcase', 'free') then raise exception 'invalid distribution mode'; end if;
  if v_path = '' or v_path not like (v_user_id::text || '/%') then
    raise exception 'invalid social media path';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'social-posts'
      and object.name = v_path
      and object.owner_id = v_user_id::text
  ) then
    raise exception 'uploaded social media was not found';
  end if;

  select
    coalesce(nullif(left(btrim(profile.nickname), 40), ''), 'PiXiEEDクリエイター'),
    coalesce(nullif(left(btrim(profile.avatar), 240), ''), 'mao')
  into v_name, v_avatar
  from public.user_profiles profile
  where profile.id = v_user_id;

  insert into public.social_posts (
    post_kind, distribution_mode, creator_user_id, creator_display_name,
    creator_avatar, caption, media_object_path, derivative_allowed
  ) values (
    'image', v_distribution, v_user_id,
    coalesce(v_name, 'PiXiEEDクリエイター'), coalesce(v_avatar, 'mao'),
    v_caption, v_path,
    v_distribution = 'free' and coalesce(input_derivative_allowed, false)
  ) returning id into v_post_id;
  return v_post_id;
end;
$$;
revoke all on function public.social_create_image_post_v1(text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.social_create_image_post_v1(text, text, text, boolean)
  to authenticated;

create or replace function public.social_toggle_like_v1(input_post_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_liked boolean;
  v_count integer;
begin
  if v_user_id is null then raise exception 'login required'; end if;
  if not exists (
    select 1 from public.social_posts post
    where post.id = input_post_id and post.status = 'published'
  ) then raise exception 'published post not found'; end if;

  delete from public.social_post_likes
  where post_id = input_post_id and user_id = v_user_id;
  if found then
    v_liked := false;
  else
    insert into public.social_post_likes(post_id, user_id)
    values (input_post_id, v_user_id)
    on conflict do nothing;
    v_liked := true;
  end if;
  select like_count into v_count from public.social_posts where id = input_post_id;
  return jsonb_build_object('post_id', input_post_id, 'liked', v_liked, 'like_count', coalesce(v_count, 0));
end;
$$;
revoke all on function public.social_toggle_like_v1(uuid) from public, anon, authenticated;
grant execute on function public.social_toggle_like_v1(uuid) to authenticated;

create or replace function public.social_public_feed_v1(input_limit integer default 120)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(feed.entry order by feed.published_at desc, feed.id desc), '[]'::jsonb)
  from (
    select post.id, post.published_at,
      jsonb_build_object(
        'id', post.id,
        'post_kind', post.post_kind,
        'creator_display_name', post.creator_display_name,
        'creator_avatar', post.creator_avatar,
        'media_object_path', post.media_object_path,
        'source_thumbnail_url', post.source_thumbnail_url,
        'market_asset_id', post.market_asset_id,
        'pixfind_puzzle_id', post.pixfind_puzzle_id,
        'like_count', post.like_count,
        'liked_by_me', exists (
          select 1 from public.social_post_likes reaction
          where reaction.post_id = post.id and reaction.user_id = auth.uid()
        ),
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
    'id', post.id,
    'post_kind', post.post_kind,
    'distribution_mode', post.distribution_mode,
    'creator_display_name', post.creator_display_name,
    'creator_avatar', post.creator_avatar,
    'caption', post.caption,
    'media_object_path', post.media_object_path,
    'source_thumbnail_url', post.source_thumbnail_url,
    'market_asset_id', post.market_asset_id,
    'pixfind_puzzle_id', post.pixfind_puzzle_id,
    'derivative_allowed', post.derivative_allowed,
    'sale_price_yen', market.sale_price_yen,
    'like_count', post.like_count,
    'liked_by_me', exists (
      select 1 from public.social_post_likes reaction
      where reaction.post_id = post.id and reaction.user_id = auth.uid()
    ),
    'published_at', post.published_at
  )
  from public.social_posts post
  left join public.market_assets market on market.id = post.market_asset_id
  where post.id = input_post_id and post.status = 'published';
$$;
revoke all on function public.social_public_post_v1(uuid) from public, anon, authenticated;
grant execute on function public.social_public_post_v1(uuid) to anon, authenticated;

create or replace function public.social_posts_for_sources_v1(
  input_post_kind text,
  input_source_ids text[]
)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', post.id,
    'source_id', case
      when post.post_kind = 'market' then post.market_asset_id::text
      when post.post_kind = 'pixfind' then post.pixfind_puzzle_id
      else post.id::text
    end,
    'like_count', post.like_count,
    'liked_by_me', exists (
      select 1 from public.social_post_likes reaction
      where reaction.post_id = post.id and reaction.user_id = auth.uid()
    )
  )), '[]'::jsonb)
  from public.social_posts post
  where post.status = 'published'
    and post.post_kind = lower(btrim(coalesce(input_post_kind, '')))
    and case
      when post.post_kind = 'market' then post.market_asset_id::text = any(coalesce(input_source_ids, array[]::text[]))
      when post.post_kind = 'pixfind' then post.pixfind_puzzle_id = any(coalesce(input_source_ids, array[]::text[]))
      else post.id::text = any(coalesce(input_source_ids, array[]::text[]))
    end;
$$;
revoke all on function public.social_posts_for_sources_v1(text, text[]) from public, anon, authenticated;
grant execute on function public.social_posts_for_sources_v1(text, text[]) to anon, authenticated;

create or replace function public.social_sync_market_post()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_avatar text;
begin
  if new.status = 'published' and new.withdrawn_at is null then
    select coalesce(nullif(left(btrim(profile.avatar), 240), ''), 'mao')
    into v_avatar from public.user_profiles profile where profile.id = new.creator_user_id;
    insert into public.social_posts (
      post_kind, distribution_mode, creator_user_id, creator_display_name,
      creator_avatar, caption, market_asset_id, status, published_at
    ) values (
      'market', 'paid', new.creator_user_id,
      coalesce(nullif(left(btrim(new.creator_display_name), 40), ''), 'PiXiEEDクリエイター'),
      coalesce(v_avatar, 'mao'), left(coalesce(new.description, ''), 2000),
      new.id, 'published', coalesce(new.published_at, timezone('utc', now()))
    )
    on conflict (market_asset_id) do update set
      creator_user_id = excluded.creator_user_id,
      creator_display_name = excluded.creator_display_name,
      creator_avatar = excluded.creator_avatar,
      caption = excluded.caption,
      status = 'published',
      published_at = excluded.published_at;
  else
    update public.social_posts set status = 'archived' where market_asset_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists market_assets_sync_social_post on public.market_assets;
create trigger market_assets_sync_social_post
after insert or update of status, withdrawn_at, published_at, creator_display_name, description
on public.market_assets
for each row execute function public.social_sync_market_post();
revoke all on function public.social_sync_market_post() from public, anon, authenticated;

create or replace function public.social_sync_pixfind_post()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_avatar text;
begin
  if new.creator_user_id is not null then
    select
      coalesce(nullif(left(btrim(profile.nickname), 40), ''), nullif(left(btrim(new.author_name), 40), ''), 'PiXiEEDクリエイター'),
      coalesce(nullif(left(btrim(profile.avatar), 240), ''), nullif(left(btrim(new.author_avatar), 240), ''), 'mao')
    into v_name, v_avatar
    from public.user_profiles profile where profile.id = new.creator_user_id;
  end if;
  insert into public.social_posts (
    post_kind, distribution_mode, creator_user_id, creator_display_name,
    creator_avatar, caption, source_thumbnail_url, pixfind_puzzle_id,
    status, published_at
  ) values (
    'pixfind', 'pixfind', new.creator_user_id,
    coalesce(v_name, nullif(left(btrim(new.author_name), 40), ''), '名無し'),
    coalesce(v_avatar, nullif(left(btrim(new.author_avatar), 240), ''), 'mao'),
    left(coalesce(new.description, ''), 2000),
    coalesce(nullif(new.thumbnail_url, ''), nullif(new.diff_url, ''), new.original_url),
    new.id, 'published', new.created_at
  )
  on conflict (pixfind_puzzle_id) do update set
    creator_user_id = excluded.creator_user_id,
    creator_display_name = excluded.creator_display_name,
    creator_avatar = excluded.creator_avatar,
    caption = excluded.caption,
    source_thumbnail_url = excluded.source_thumbnail_url,
    status = 'published';
  return new;
end;
$$;

drop trigger if exists pixfind_puzzles_sync_social_post on public.pixfind_puzzles;
create trigger pixfind_puzzles_sync_social_post
after insert or update of creator_user_id, author_name, author_avatar, description, thumbnail_url, diff_url, original_url
on public.pixfind_puzzles
for each row execute function public.social_sync_pixfind_post();
revoke all on function public.social_sync_pixfind_post() from public, anon, authenticated;

create or replace function public.social_archive_deleted_pixfind_post()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.social_posts set status = 'archived' where pixfind_puzzle_id = old.id;
  return old;
end;
$$;

drop trigger if exists pixfind_puzzles_archive_social_post on public.pixfind_puzzles;
create trigger pixfind_puzzles_archive_social_post
before delete on public.pixfind_puzzles
for each row execute function public.social_archive_deleted_pixfind_post();
revoke all on function public.social_archive_deleted_pixfind_post() from public, anon, authenticated;

create or replace function public.social_sync_creator_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.social_posts
  set creator_display_name = coalesce(nullif(left(btrim(new.nickname), 40), ''), 'PiXiEEDクリエイター'),
      creator_avatar = coalesce(nullif(left(btrim(new.avatar), 240), ''), 'mao')
  where creator_user_id = new.id;
  return new;
end;
$$;

drop trigger if exists user_profiles_sync_social_posts on public.user_profiles;
create trigger user_profiles_sync_social_posts
after insert or update of nickname, avatar on public.user_profiles
for each row execute function public.social_sync_creator_profile();
revoke all on function public.social_sync_creator_profile() from public, anon, authenticated;

insert into public.social_posts (
  post_kind, distribution_mode, creator_user_id, creator_display_name,
  creator_avatar, caption, market_asset_id, status, published_at
)
select 'market', 'paid', asset.creator_user_id,
  coalesce(nullif(left(btrim(asset.creator_display_name), 40), ''), 'PiXiEEDクリエイター'),
  coalesce(nullif(left(btrim(profile.avatar), 240), ''), 'mao'),
  left(coalesce(asset.description, ''), 2000), asset.id, 'published',
  coalesce(asset.published_at, asset.created_at)
from public.market_assets asset
left join public.user_profiles profile on profile.id = asset.creator_user_id
where asset.status = 'published' and asset.withdrawn_at is null
on conflict (market_asset_id) do nothing;

insert into public.social_posts (
  post_kind, distribution_mode, creator_user_id, creator_display_name,
  creator_avatar, caption, source_thumbnail_url, pixfind_puzzle_id,
  status, published_at
)
select 'pixfind', 'pixfind', puzzle.creator_user_id,
  coalesce(nullif(left(btrim(profile.nickname), 40), ''), nullif(left(btrim(puzzle.author_name), 40), ''), '名無し'),
  coalesce(nullif(left(btrim(profile.avatar), 240), ''), nullif(left(btrim(puzzle.author_avatar), 240), ''), 'mao'),
  left(coalesce(puzzle.description, ''), 2000),
  coalesce(nullif(puzzle.thumbnail_url, ''), nullif(puzzle.diff_url, ''), puzzle.original_url),
  puzzle.id, 'published', puzzle.created_at
from public.pixfind_puzzles puzzle
left join public.user_profiles profile on profile.id = puzzle.creator_user_id
on conflict (pixfind_puzzle_id) do nothing;
