alter table public.user_posts
  add column author_name text not null default '',
  add constraint user_posts_author_name_length check (char_length(author_name) <= 40 and author_name !~ '[[:cntrl:]]');

alter table public.post_map_points
  add column author_name text not null default '',
  add constraint post_map_points_author_name_length check (char_length(author_name) <= 40 and author_name !~ '[[:cntrl:]]');

create table public.post_author_profiles (
  author_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40 and display_name !~ '[[:cntrl:]]'),
  updated_at timestamptz not null default now()
);
alter table public.post_author_profiles enable row level security;
revoke all on table public.post_author_profiles from public, anon, authenticated, service_role;
grant select on table public.post_author_profiles to authenticated;
grant select, insert, update, delete on table public.post_author_profiles to service_role;
create policy "authors can read their public post name"
  on public.post_author_profiles
  for select to authenticated
  using ((select auth.uid()) = author_id);

create function public.pixieed_apply_new_post_author_name()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.author_id::text, 0));
  select display_name into new.author_name
    from public.post_author_profiles where author_id = new.author_id;
  if not found then new.author_name := ''; end if;
  return new;
end;
$$;
revoke all on function public.pixieed_apply_new_post_author_name() from public, anon, authenticated;
grant execute on function public.pixieed_apply_new_post_author_name() to service_role;
create trigger apply_new_post_author_name
  before insert on public.user_posts
  for each row execute function public.pixieed_apply_new_post_author_name();

create function public.pixieed_copy_post_author_name_to_point()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  select author_name into new.author_name
    from public.user_posts where id = new.post_id;
  if not found then new.author_name := ''; end if;
  return new;
end;
$$;
revoke all on function public.pixieed_copy_post_author_name_to_point() from public, anon, authenticated;
grant execute on function public.pixieed_copy_post_author_name_to_point() to service_role;
create trigger copy_post_author_name_to_point
  before insert or update on public.post_map_points
  for each row execute function public.pixieed_copy_post_author_name_to_point();

create function public.pixieed_set_post_author_name(
  p_author_id uuid,
  p_name text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_author_id is null or p_name is null
    or char_length(p_name) not between 1 and 40
    or p_name <> btrim(p_name)
    or p_name ~ '^[[:space:]]*$'
    or p_name ~ '[[:cntrl:]]' then
    raise exception 'author_name_invalid' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_author_id::text, 0));
  insert into public.post_author_profiles(author_id,display_name,updated_at)
    values (p_author_id,p_name,now())
    on conflict (author_id) do update set display_name = excluded.display_name, updated_at = excluded.updated_at;

  -- Serialize with deletion so no newly deleted post receives later public metadata.
  perform 1 from public.user_posts
    where author_id = p_author_id and deleted_at is null
    order by id for update;

  update public.user_posts
    set author_name = p_name, updated_at = now()
    where author_id = p_author_id and deleted_at is null;

  update public.post_map_points point
    set author_name = p_name
    from public.user_posts post
    where post.id = point.post_id
      and post.author_id = p_author_id
      and post.deleted_at is null;

  return jsonb_build_object('ok',true,'name',p_name);
end;
$$;

revoke all on function public.pixieed_set_post_author_name(uuid, text) from public, anon, authenticated;
grant execute on function public.pixieed_set_post_author_name(uuid, text) to service_role;
