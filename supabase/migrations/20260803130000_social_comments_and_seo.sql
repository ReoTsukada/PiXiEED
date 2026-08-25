-- Search-ready metadata and moderated text comments for the shared artwork SNS.

alter table public.social_posts
  add column if not exists title text,
  add column if not exists tags text[] not null default array[]::text[],
  add column if not exists comments_enabled boolean not null default true,
  add column if not exists comment_count integer not null default 0 check (comment_count >= 0);

alter table public.social_posts
  drop constraint if exists social_posts_title_length_check;
alter table public.social_posts
  add constraint social_posts_title_length_check
  check (title is null or char_length(btrim(title)) between 1 and 60);
alter table public.social_posts
  drop constraint if exists social_posts_tags_check;
alter table public.social_posts
  add constraint social_posts_tags_check
  check (cardinality(tags) <= 5);

update public.social_posts post
set title = left(coalesce(
  case when post.post_kind = 'market' then (
    select asset.title from public.market_assets asset where asset.id = post.market_asset_id
  ) end,
  case when post.post_kind = 'pixfind' then (
    select puzzle.label from public.pixfind_puzzles puzzle where puzzle.id = post.pixfind_puzzle_id
  ) end,
  nullif(split_part(post.caption, E'\n', 1), ''),
  post.creator_display_name || 'のドット絵'
), 60)
where post.title is null;

update public.social_posts
set title = left(coalesce(nullif(btrim(title), ''), creator_display_name || 'のドット絵'), 60)
where title is null or btrim(title) = '';

create table if not exists public.social_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  author_display_name text not null check (char_length(btrim(author_display_name)) between 1 and 40),
  author_avatar text not null default 'mao' check (char_length(author_avatar) between 1 and 240),
  body text not null check (char_length(btrim(body)) between 1 and 200),
  status text not null default 'published' check (status in ('published', 'hidden', 'deleted')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists social_post_comments_post_recent_idx
  on public.social_post_comments(post_id, status, created_at desc, id desc);
create index if not exists social_post_comments_user_recent_idx
  on public.social_post_comments(user_id, created_at desc);

alter table public.social_post_comments enable row level security;
drop policy if exists social_post_comments_public_read on public.social_post_comments;
create policy social_post_comments_public_read
on public.social_post_comments for select to anon, authenticated
using (status = 'published');

revoke all on public.social_post_comments from public, anon, authenticated;
grant select on public.social_post_comments to anon, authenticated;

create or replace function public.social_refresh_comment_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_post_id uuid := case when tg_op = 'DELETE' then old.post_id else new.post_id end;
begin
  update public.social_posts
  set comment_count = (
    select count(*)::integer from public.social_post_comments
    where post_id = v_post_id and status = 'published'
  )
  where id = v_post_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists social_post_comments_refresh_count on public.social_post_comments;
create trigger social_post_comments_refresh_count
after insert or delete or update of status on public.social_post_comments
for each row execute function public.social_refresh_comment_count();
revoke all on function public.social_refresh_comment_count() from public, anon, authenticated;

create or replace function public.social_create_image_post_v2(
  input_title text,
  input_caption text,
  input_tags text[],
  input_object_path text,
  input_distribution_mode text default 'showcase',
  input_derivative_allowed boolean default false,
  input_comments_enabled boolean default true
)
returns uuid language plpgsql security definer set search_path = public, storage as $$
declare
  v_user_id uuid := auth.uid();
  v_path text := btrim(coalesce(input_object_path, ''));
  v_title text := btrim(coalesce(input_title, ''));
  v_caption text := btrim(coalesce(input_caption, ''));
  v_distribution text := lower(btrim(coalesce(input_distribution_mode, 'showcase')));
  v_tags text[];
  v_name text;
  v_avatar text;
  v_post_id uuid;
begin
  if v_user_id is null then raise exception 'login required'; end if;
  if char_length(v_title) not between 1 and 50 then raise exception 'title must be between 1 and 50 characters'; end if;
  if char_length(v_caption) > 300 then raise exception 'caption is too long'; end if;
  if v_distribution not in ('showcase', 'free') then raise exception 'invalid distribution mode'; end if;
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
    post_kind, distribution_mode, creator_user_id, creator_display_name, creator_avatar,
    title, caption, tags, media_object_path, derivative_allowed, comments_enabled
  ) values (
    'image', v_distribution, v_user_id, coalesce(v_name, 'PiXiEEDクリエイター'), coalesce(v_avatar, 'mao'),
    v_title, v_caption, v_tags, v_path,
    v_distribution = 'free' and coalesce(input_derivative_allowed, false), coalesce(input_comments_enabled, true)
  ) returning id into v_post_id;
  return v_post_id;
end;
$$;
revoke all on function public.social_create_image_post_v2(text, text, text[], text, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.social_create_image_post_v2(text, text, text[], text, text, boolean, boolean)
  to authenticated;

create or replace function public.social_create_comment_v1(input_post_id uuid, input_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_body text := btrim(coalesce(input_body, ''));
  v_name text;
  v_avatar text;
  v_comment public.social_post_comments;
begin
  if v_user_id is null then raise exception 'login required'; end if;
  if char_length(v_body) not between 1 and 200 then raise exception 'comment must be between 1 and 200 characters'; end if;
  if char_length(v_body) - char_length(replace(v_body, E'\n', '')) > 3 then raise exception 'comment has too many lines'; end if;
  if v_body ~* '(https?://|www\.)' then raise exception 'links are not allowed in comments'; end if;
  if not exists (
    select 1 from public.social_posts post
    where post.id = input_post_id and post.status = 'published' and post.comments_enabled
  ) then raise exception 'comments are unavailable'; end if;
  if exists (
    select 1 from public.social_post_comments comment
    where comment.user_id = v_user_id and comment.created_at > timezone('utc', now()) - interval '20 seconds'
  ) then raise exception 'please wait before commenting again'; end if;
  if (select count(*) from public.social_post_comments comment
      where comment.user_id = v_user_id and comment.created_at > timezone('utc', now()) - interval '1 hour') >= 20 then
    raise exception 'hourly comment limit reached';
  end if;

  select coalesce(nullif(left(btrim(profile.nickname), 40), ''), 'PiXiEEDクリエイター'),
    coalesce(nullif(left(btrim(profile.avatar), 240), ''), 'mao')
  into v_name, v_avatar from public.user_profiles profile where profile.id = v_user_id;
  insert into public.social_post_comments(post_id, user_id, author_display_name, author_avatar, body)
  values (input_post_id, v_user_id, coalesce(v_name, 'PiXiEEDクリエイター'), coalesce(v_avatar, 'mao'), v_body)
  returning * into v_comment;
  return to_jsonb(v_comment);
end;
$$;
revoke all on function public.social_create_comment_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.social_create_comment_v1(uuid, text) to authenticated;

create or replace function public.social_public_comments_v1(input_post_id uuid, input_limit integer default 50)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', comment.id,
    'post_id', comment.post_id,
    'author_display_name', comment.author_display_name,
    'author_avatar', comment.author_avatar,
    'body', comment.body,
    'created_at', comment.created_at,
    'updated_at', comment.updated_at,
    'is_mine', comment.user_id = auth.uid()
  ) order by comment.created_at asc, comment.id asc), '[]'::jsonb)
  from (
    select item.id, item.post_id, item.user_id, item.author_display_name, item.author_avatar, item.body, item.created_at, item.updated_at
    from public.social_post_comments item
    join public.social_posts post on post.id = item.post_id and post.status = 'published'
    where item.post_id = input_post_id and item.status = 'published'
    order by item.created_at desc, item.id desc
    limit least(greatest(coalesce(input_limit, 50), 1), 50)
  ) comment;
$$;
revoke all on function public.social_public_comments_v1(uuid, integer) from public, anon, authenticated;
grant execute on function public.social_public_comments_v1(uuid, integer) to anon, authenticated;

create or replace function public.social_remove_comment_v1(input_comment_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_comment public.social_post_comments;
  v_post_creator uuid;
begin
  if v_user_id is null then raise exception 'login required'; end if;
  select * into v_comment from public.social_post_comments where id = input_comment_id;
  if v_comment.id is null then return false; end if;
  select creator_user_id into v_post_creator from public.social_posts where id = v_comment.post_id;
  if v_comment.user_id = v_user_id then
    update public.social_post_comments set status = 'deleted', body = '[削除済み]', updated_at = timezone('utc', now())
    where id = input_comment_id;
  elsif v_post_creator = v_user_id then
    update public.social_post_comments set status = 'hidden', updated_at = timezone('utc', now())
    where id = input_comment_id;
  else
    raise exception 'not allowed';
  end if;
  return true;
end;
$$;
revoke all on function public.social_remove_comment_v1(uuid) from public, anon, authenticated;
grant execute on function public.social_remove_comment_v1(uuid) to authenticated;

create or replace function public.social_public_post_v1(input_post_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', post.id, 'post_kind', post.post_kind, 'distribution_mode', post.distribution_mode,
    'creator_is_me', post.creator_user_id = auth.uid(), 'creator_display_name', post.creator_display_name,
    'creator_avatar', post.creator_avatar, 'title', post.title, 'caption', post.caption, 'tags', post.tags,
    'media_object_path', post.media_object_path, 'source_thumbnail_url', post.source_thumbnail_url,
    'market_asset_id', post.market_asset_id, 'pixfind_puzzle_id', post.pixfind_puzzle_id,
    'derivative_allowed', post.derivative_allowed, 'comments_enabled', post.comments_enabled,
    'comment_count', post.comment_count, 'sale_price_yen', market.sale_price_yen,
    'like_count', post.like_count,
    'liked_by_me', exists (select 1 from public.social_post_likes reaction where reaction.post_id = post.id and reaction.user_id = auth.uid()),
    'published_at', post.published_at
  )
  from public.social_posts post left join public.market_assets market on market.id = post.market_asset_id
  where post.id = input_post_id and post.status = 'published';
$$;
revoke all on function public.social_public_post_v1(uuid) from public, anon, authenticated;
grant execute on function public.social_public_post_v1(uuid) to anon, authenticated;

create or replace function public.social_public_seo_catalog_v1()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', post.id, 'title', post.title, 'caption', post.caption, 'tags', post.tags,
    'creator_display_name', post.creator_display_name, 'creator_avatar', post.creator_avatar,
    'media_object_path', post.media_object_path, 'distribution_mode', post.distribution_mode,
    'derivative_allowed', post.derivative_allowed, 'like_count', post.like_count,
    'comment_count', post.comment_count, 'comments_enabled', post.comments_enabled,
    'published_at', post.published_at, 'updated_at', post.updated_at
  ) order by post.published_at desc), '[]'::jsonb)
  from public.social_posts post
  where post.status = 'published' and post.post_kind = 'image' and post.title is not null;
$$;
revoke all on function public.social_public_seo_catalog_v1() from public, anon, authenticated;
grant execute on function public.social_public_seo_catalog_v1() to anon, authenticated;

create or replace function public.social_sync_market_post()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_avatar text;
begin
  if new.status = 'published' and new.withdrawn_at is null then
    select coalesce(nullif(left(btrim(profile.avatar), 240), ''), 'mao') into v_avatar
    from public.user_profiles profile where profile.id = new.creator_user_id;
    insert into public.social_posts(post_kind, distribution_mode, creator_user_id, creator_display_name, creator_avatar, title, caption, market_asset_id, status, published_at)
    values ('market', 'paid', new.creator_user_id, coalesce(nullif(left(btrim(new.creator_display_name), 40), ''), 'PiXiEEDクリエイター'),
      coalesce(v_avatar, 'mao'), left(coalesce(nullif(btrim(new.title), ''), 'マーケット素材'), 60), left(coalesce(new.description, ''), 2000),
      new.id, 'published', coalesce(new.published_at, timezone('utc', now())))
    on conflict (market_asset_id) do update set creator_user_id=excluded.creator_user_id, creator_display_name=excluded.creator_display_name,
      creator_avatar=excluded.creator_avatar, title=excluded.title, caption=excluded.caption, status='published', published_at=excluded.published_at;
  else update public.social_posts set status='archived' where market_asset_id=new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.social_sync_market_post() from public, anon, authenticated;

create or replace function public.social_sync_pixfind_post()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_avatar text;
begin
  if new.creator_user_id is not null then
    select coalesce(nullif(left(btrim(profile.nickname),40),''),nullif(left(btrim(new.author_name),40),''),'PiXiEEDクリエイター'),
      coalesce(nullif(left(btrim(profile.avatar),240),''),nullif(left(btrim(new.author_avatar),240),''),'mao')
    into v_name,v_avatar from public.user_profiles profile where profile.id=new.creator_user_id;
  end if;
  insert into public.social_posts(post_kind,distribution_mode,creator_user_id,creator_display_name,creator_avatar,title,caption,source_thumbnail_url,pixfind_puzzle_id,status,published_at)
  values ('pixfind','pixfind',new.creator_user_id,coalesce(v_name,nullif(left(btrim(new.author_name),40),''),'名無し'),
    coalesce(v_avatar,nullif(left(btrim(new.author_avatar),240),''),'mao'),left(coalesce(nullif(btrim(new.label),''),'PiXFiNDパズル'),60),
    left(coalesce(new.description,''),2000),coalesce(nullif(new.thumbnail_url,''),nullif(new.diff_url,''),new.original_url),new.id,'published',new.created_at)
  on conflict (pixfind_puzzle_id) do update set creator_user_id=excluded.creator_user_id,creator_display_name=excluded.creator_display_name,
    creator_avatar=excluded.creator_avatar,title=excluded.title,caption=excluded.caption,source_thumbnail_url=excluded.source_thumbnail_url,status='published';
  return new;
end;
$$;
revoke all on function public.social_sync_pixfind_post() from public, anon, authenticated;

drop trigger if exists market_assets_sync_social_post on public.market_assets;
create trigger market_assets_sync_social_post
after insert or update of status, withdrawn_at, published_at, creator_display_name, title, description
on public.market_assets for each row execute function public.social_sync_market_post();

drop trigger if exists pixfind_puzzles_sync_social_post on public.pixfind_puzzles;
create trigger pixfind_puzzles_sync_social_post
after insert or update of creator_user_id, author_name, author_avatar, label, description, thumbnail_url, diff_url, original_url
on public.pixfind_puzzles for each row execute function public.social_sync_pixfind_post();
