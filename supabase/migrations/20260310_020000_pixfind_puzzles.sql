create table if not exists public.pixfind_puzzles (
  id text primary key,
  slug text unique,
  label text not null default 'PiXFiND Puzzle',
  description text not null default '',
  difficulty integer not null default 1 check (difficulty between 1 and 3),
  mode text,
  game_mode text,
  play_mode text,
  targets jsonb,
  author_name text not null default '名無し',
  author_x_url text,
  author_avatar text,
  original_url text not null,
  diff_url text not null,
  thumbnail_url text,
  share_url text,
  client_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.pixfind_puzzles add column if not exists slug text;
alter table public.pixfind_puzzles add column if not exists label text not null default 'PiXFiND Puzzle';
alter table public.pixfind_puzzles add column if not exists description text not null default '';
alter table public.pixfind_puzzles add column if not exists difficulty integer not null default 1;
alter table public.pixfind_puzzles add column if not exists mode text;
alter table public.pixfind_puzzles add column if not exists game_mode text;
alter table public.pixfind_puzzles add column if not exists play_mode text;
alter table public.pixfind_puzzles add column if not exists targets jsonb;
alter table public.pixfind_puzzles add column if not exists author_name text not null default '名無し';
alter table public.pixfind_puzzles add column if not exists author_x_url text;
alter table public.pixfind_puzzles add column if not exists author_avatar text;
alter table public.pixfind_puzzles add column if not exists original_url text;
alter table public.pixfind_puzzles add column if not exists diff_url text;
alter table public.pixfind_puzzles add column if not exists thumbnail_url text;
alter table public.pixfind_puzzles add column if not exists share_url text;
alter table public.pixfind_puzzles add column if not exists client_id text;
alter table public.pixfind_puzzles add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.pixfind_puzzles add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.pixfind_puzzles alter column label set default 'PiXFiND Puzzle';
alter table public.pixfind_puzzles alter column description set default '';
alter table public.pixfind_puzzles alter column difficulty set default 1;
alter table public.pixfind_puzzles alter column author_name set default '名無し';
alter table public.pixfind_puzzles alter column created_at set default timezone('utc', now());
alter table public.pixfind_puzzles alter column updated_at set default timezone('utc', now());

create index if not exists pixfind_puzzles_created_at_idx
  on public.pixfind_puzzles (created_at desc);

create index if not exists pixfind_puzzles_client_id_idx
  on public.pixfind_puzzles (client_id);

create unique index if not exists pixfind_puzzles_slug_idx
  on public.pixfind_puzzles (slug)
  where slug is not null;

create or replace function public.set_pixfind_puzzles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_set_pixfind_puzzles_updated_at on public.pixfind_puzzles;
create trigger trg_set_pixfind_puzzles_updated_at
before update on public.pixfind_puzzles
for each row
execute function public.set_pixfind_puzzles_updated_at();

create or replace function public.request_client_id()
returns text
language plpgsql
stable
as $$
declare
  v_headers_raw text := nullif(current_setting('request.headers', true), '');
  v_headers jsonb := '{}'::jsonb;
begin
  if v_headers_raw is not null then
    v_headers := v_headers_raw::jsonb;
  end if;
  return coalesce(nullif(trim(v_headers ->> 'x-client-id'), ''), '');
exception
  when others then
    return '';
end;
$$;

alter table public.pixfind_puzzles enable row level security;

revoke all on public.pixfind_puzzles from anon, authenticated;
grant select, insert, update, delete on public.pixfind_puzzles to anon, authenticated;
grant usage on schema public to anon, authenticated;

drop policy if exists pixfind_puzzles_select on public.pixfind_puzzles;
create policy pixfind_puzzles_select
on public.pixfind_puzzles
for select
to anon, authenticated
using (true);

drop policy if exists pixfind_puzzles_insert on public.pixfind_puzzles;
create policy pixfind_puzzles_insert
on public.pixfind_puzzles
for insert
to anon, authenticated
with check (
  coalesce(client_id, '') <> ''
  and client_id = public.request_client_id()
);

drop policy if exists pixfind_puzzles_update on public.pixfind_puzzles;
create policy pixfind_puzzles_update
on public.pixfind_puzzles
for update
to anon, authenticated
using (
  coalesce(client_id, '') <> ''
  and client_id = public.request_client_id()
)
with check (
  coalesce(client_id, '') <> ''
  and client_id = public.request_client_id()
);

drop policy if exists pixfind_puzzles_delete on public.pixfind_puzzles;
create policy pixfind_puzzles_delete
on public.pixfind_puzzles
for delete
to anon, authenticated
using (
  coalesce(client_id, '') <> ''
  and client_id = public.request_client_id()
);

create or replace function public.repair_legacy_pixfind_puzzle_assets(
  p_id text,
  p_original_url text default null,
  p_diff_url text default null,
  p_thumbnail_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := left(trim(coalesce(p_id, '')), 120);
  v_contest_prefix text := 'https://kyyiuakrqomzlikfaire.supabase.co/storage/v1/object/public/pixieed-contest/puzzles/';
  v_blocked_prefix text := 'https://kyyiuakrqomzlikfaire.supabase.co/storage/v1/object/public/pixieed-contest/';
  v_next_original text := nullif(trim(coalesce(p_original_url, '')), '');
  v_next_diff text := nullif(trim(coalesce(p_diff_url, '')), '');
  v_next_thumbnail text := nullif(trim(coalesce(p_thumbnail_url, '')), '');
  v_row public.pixfind_puzzles%rowtype;
begin
  if v_id = '' then
    raise exception 'id is required';
  end if;

  if v_next_original is not null and v_next_original like v_blocked_prefix || '%' then
    raise exception 'contest bucket url is not allowed for original_url';
  end if;
  if v_next_diff is not null and v_next_diff like v_blocked_prefix || '%' then
    raise exception 'contest bucket url is not allowed for diff_url';
  end if;
  if v_next_thumbnail is not null and v_next_thumbnail like v_blocked_prefix || '%' then
    raise exception 'contest bucket url is not allowed for thumbnail_url';
  end if;

  select *
    into v_row
    from public.pixfind_puzzles
   where id = v_id
   for update;

  if not found then
    raise exception 'pixfind puzzle not found';
  end if;

  if coalesce(v_row.original_url, '') not like v_contest_prefix || '%'
     and coalesce(v_row.diff_url, '') not like v_contest_prefix || '%'
     and coalesce(v_row.thumbnail_url, '') not like v_contest_prefix || '%'
  then
    return jsonb_build_object(
      'id', v_row.id,
      'original_url', v_row.original_url,
      'diff_url', v_row.diff_url,
      'thumbnail_url', v_row.thumbnail_url
    );
  end if;

  update public.pixfind_puzzles
     set original_url = coalesce(v_next_original, original_url),
         diff_url = coalesce(v_next_diff, diff_url),
         thumbnail_url = coalesce(v_next_thumbnail, thumbnail_url),
         updated_at = timezone('utc', now())
   where id = v_id
   returning *
      into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'original_url', v_row.original_url,
    'diff_url', v_row.diff_url,
    'thumbnail_url', v_row.thumbnail_url
  );
end;
$$;

grant execute on function public.request_client_id() to anon, authenticated;
grant execute on function public.repair_legacy_pixfind_puzzle_assets(text, text, text, text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pixfind-puzzles',
  'pixfind-puzzles',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'text/html']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

grant usage on schema storage to anon, authenticated;
grant select, insert on storage.objects to anon, authenticated;

drop policy if exists pixfind_puzzles_storage_select on storage.objects;
create policy pixfind_puzzles_storage_select
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'pixfind-puzzles');

drop policy if exists pixfind_puzzles_storage_insert on storage.objects;
create policy pixfind_puzzles_storage_insert
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'pixfind-puzzles');
