-- Public, text-only requests for materials people want to see in the market.
-- The public reader intentionally returns no account identifiers.
create table if not exists public.market_want_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  body text not null,
  is_seed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  constraint market_want_posts_body_check check (
    char_length(body) between 1 and 25
    and body = btrim(body)
    and body !~ E'[\\r\\n]'
  ),
  constraint market_want_posts_author_check check (
    (is_seed and user_id is null) or (not is_seed and user_id is not null)
  )
);

create index if not exists market_want_posts_recent_idx
  on public.market_want_posts(created_at desc);
create unique index if not exists market_want_posts_seed_body_unique
  on public.market_want_posts(body) where is_seed;

insert into public.market_want_posts (body, is_seed)
values
  ('32×32PXの4方向歩行素体', true),
  ('ほのぼのとした街のアセット', true)
on conflict (body) where is_seed do nothing;

alter table public.market_want_posts enable row level security;
revoke all on table public.market_want_posts from public, anon, authenticated;

create or replace function public.market_public_want_posts_v1()
returns table (body text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select post.body, post.created_at
  from public.market_want_posts as post
  -- md5 makes a stable daily pseudo-random order without exposing user data.
  -- The day boundary follows Japan time, so the featured request changes daily.
  order by md5(post.id::text || (timezone('Asia/Tokyo', now())::date)::text)
  limit 1;
$$;

create or replace function public.market_create_want_post_v1(input_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_body text := btrim(coalesce(input_body, ''));
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'login required';
  end if;
  if char_length(v_body) not between 1 and 25 or v_body ~ E'[\\r\\n]' then
    raise exception 'post must be plain text up to 25 characters';
  end if;
  if exists (
    select 1 from public.market_want_posts
    where user_id = v_user_id
      and created_at > timezone('utc', now()) - interval '30 seconds'
  ) then
    raise exception 'please wait before posting again';
  end if;
  insert into public.market_want_posts(user_id, body)
  values (v_user_id, v_body)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.market_public_want_posts_v1() from public;
grant execute on function public.market_public_want_posts_v1() to anon, authenticated;
revoke all on function public.market_create_want_post_v1(text) from public, anon;
grant execute on function public.market_create_want_post_v1(text) to authenticated;
