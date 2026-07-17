-- Social discovery for marketplace assets without exposing favorite-user lists
-- or private profile rows to the public catalog.

alter table public.market_assets
  add column if not exists tags text[] not null default array[]::text[],
  add column if not exists favorite_count integer not null default 0,
  add column if not exists derivative_count integer not null default 0,
  add column if not exists creator_display_name text not null default 'PiXiEEDクリエイター';

create or replace function public.market_tags_are_valid(input_tags text[])
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_tag text;
begin
  if coalesce(cardinality(input_tags), 0) > 8 then return false; end if;
  foreach v_tag in array coalesce(input_tags, array[]::text[]) loop
    if v_tag is null or char_length(btrim(v_tag)) not between 1 and 24 or v_tag <> btrim(v_tag) then
      return false;
    end if;
  end loop;
  return (select count(*) = count(distinct lower(tag)) from unnest(coalesce(input_tags, array[]::text[])) as valueset(tag));
end;
$$;

alter table public.market_assets drop constraint if exists market_assets_tags_valid;
alter table public.market_assets add constraint market_assets_tags_valid check (public.market_tags_are_valid(tags));
alter table public.market_assets drop constraint if exists market_assets_favorite_count_nonnegative;
alter table public.market_assets add constraint market_assets_favorite_count_nonnegative check (favorite_count >= 0);
alter table public.market_assets drop constraint if exists market_assets_derivative_count_nonnegative;
alter table public.market_assets add constraint market_assets_derivative_count_nonnegative check (derivative_count >= 0);
alter table public.market_assets drop constraint if exists market_assets_creator_display_name_valid;
alter table public.market_assets add constraint market_assets_creator_display_name_valid
  check (char_length(btrim(creator_display_name)) between 1 and 40);

create index if not exists market_assets_tags_gin_idx on public.market_assets using gin(tags);
create index if not exists market_assets_popular_idx
  on public.market_assets(status, favorite_count desc, published_at desc);
create index if not exists market_assets_popular_derivative_idx
  on public.market_assets(favorite_count desc, published_at desc)
  where status = 'published' and parent_asset_id is not null;

create table if not exists public.market_asset_favorites (
  asset_id uuid not null references public.market_assets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (asset_id, user_id)
);

create index if not exists market_asset_favorites_user_recent_idx
  on public.market_asset_favorites(user_id, created_at desc);

alter table public.market_asset_favorites enable row level security;

drop policy if exists market_asset_favorites_read_own on public.market_asset_favorites;
create policy market_asset_favorites_read_own
on public.market_asset_favorites for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists market_asset_favorites_insert_own on public.market_asset_favorites;
create policy market_asset_favorites_insert_own
on public.market_asset_favorites for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and public.market_current_user_has_confirmed_identity()
  and exists (
    select 1 from public.market_assets as asset
    where asset.id = market_asset_favorites.asset_id and asset.status = 'published'
  )
);

drop policy if exists market_asset_favorites_delete_own on public.market_asset_favorites;
create policy market_asset_favorites_delete_own
on public.market_asset_favorites for delete
to authenticated
using (user_id = (select auth.uid()) and public.market_current_user_has_confirmed_identity());

revoke all on table public.market_asset_favorites from public, anon, authenticated;
grant select, insert, delete on table public.market_asset_favorites to authenticated;

create or replace function public.market_refresh_asset_favorite_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_id uuid;
begin
  v_asset_id := case when tg_op = 'DELETE' then old.asset_id else new.asset_id end;
  update public.market_assets
  set favorite_count = (
    select count(*)::integer from public.market_asset_favorites where asset_id = v_asset_id
  ), updated_at = timezone('utc', now())
  where id = v_asset_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists market_asset_favorites_refresh_count on public.market_asset_favorites;
create trigger market_asset_favorites_refresh_count
after insert or delete on public.market_asset_favorites
for each row execute function public.market_refresh_asset_favorite_count();
revoke all on function public.market_refresh_asset_favorite_count() from public, anon, authenticated;

create or replace function public.market_refresh_parent_derivative_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_id uuid;
begin
  foreach v_parent_id in array (case
    when tg_op = 'INSERT' then array[new.parent_asset_id]
    when tg_op = 'DELETE' then array[old.parent_asset_id]
    else array[old.parent_asset_id, new.parent_asset_id]
  end) loop
    if v_parent_id is not null then
      update public.market_assets
      set derivative_count = (
        select count(*)::integer from public.market_assets as child
        where child.parent_asset_id = v_parent_id and child.status = 'published'
      ), updated_at = timezone('utc', now())
      where id = v_parent_id;
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists market_assets_refresh_parent_derivative_count on public.market_assets;
create trigger market_assets_refresh_parent_derivative_count
after insert or delete or update of parent_asset_id, status on public.market_assets
for each row execute function public.market_refresh_parent_derivative_count();
revoke all on function public.market_refresh_parent_derivative_count() from public, anon, authenticated;

create or replace function public.market_set_asset_creator_display_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(nullif(left(btrim(profile.nickname), 40), ''), 'PiXiEEDクリエイター')
  into new.creator_display_name
  from public.user_profiles as profile
  where profile.id = new.creator_user_id;
  new.creator_display_name := coalesce(new.creator_display_name, 'PiXiEEDクリエイター');
  return new;
end;
$$;

drop trigger if exists market_assets_set_creator_display_name on public.market_assets;
create trigger market_assets_set_creator_display_name
before insert or update of creator_user_id on public.market_assets
for each row execute function public.market_set_asset_creator_display_name();
revoke all on function public.market_set_asset_creator_display_name() from public, anon, authenticated;

create or replace function public.market_sync_creator_display_name_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_should_sync boolean := false;
begin
  if tg_op = 'INSERT' then
    v_should_sync := true;
  else
    v_should_sync := new.nickname is distinct from old.nickname;
  end if;
  if v_should_sync then
    update public.market_assets
    set creator_display_name = coalesce(nullif(left(btrim(new.nickname), 40), ''), 'PiXiEEDクリエイター'),
        updated_at = timezone('utc', now())
    where creator_user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists user_profiles_sync_market_creator_name on public.user_profiles;
create trigger user_profiles_sync_market_creator_name
after insert or update of nickname on public.user_profiles
for each row execute function public.market_sync_creator_display_name_from_profile();
revoke all on function public.market_sync_creator_display_name_from_profile() from public, anon, authenticated;

update public.market_assets as asset
set creator_display_name = coalesce(nullif(left(btrim(profile.nickname), 40), ''), 'PiXiEEDクリエイター')
from public.user_profiles as profile
where profile.id = asset.creator_user_id;

update public.market_assets as parent
set derivative_count = (
  select count(*)::integer from public.market_assets as child
  where child.parent_asset_id = parent.id and child.status = 'published'
);

create or replace function public.market_set_listing_tags(
  input_asset_id uuid,
  input_tags text[]
)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw_tag text;
  v_tag text;
  v_tags text[] := array[]::text[];
begin
  if not public.market_current_user_can_sell() then
    raise exception 'verified seller account required';
  end if;
  if coalesce(cardinality(input_tags), 0) > 16 then
    raise exception 'too many input tags';
  end if;
  foreach v_raw_tag in array coalesce(input_tags, array[]::text[]) loop
    v_tag := regexp_replace(btrim(regexp_replace(coalesce(v_raw_tag, ''), '^[#＃]+', '')), '[[:space:]]+', ' ', 'g');
    if v_tag = '' then continue; end if;
    if char_length(v_tag) > 24 then raise exception 'tag is too long'; end if;
    if not exists (select 1 from unnest(v_tags) as valueset(value) where lower(value) = lower(v_tag)) then
      v_tags := array_append(v_tags, v_tag);
    end if;
    if cardinality(v_tags) > 8 then raise exception 'up to 8 tags are allowed'; end if;
  end loop;

  update public.market_assets
  set tags = v_tags, updated_at = timezone('utc', now())
  where id = input_asset_id and creator_user_id = auth.uid() and status = 'draft';
  if not found then raise exception 'editable draft not found'; end if;

  insert into public.market_audit_log(actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), 'listing_tags_updated', 'market_asset', input_asset_id::text, jsonb_build_object('tags', v_tags));
  return v_tags;
end;
$$;

revoke all on function public.market_set_listing_tags(uuid, text[]) from public, anon, authenticated;
grant execute on function public.market_set_listing_tags(uuid, text[]) to authenticated;
