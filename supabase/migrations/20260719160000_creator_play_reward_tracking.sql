-- Generic, abuse-resistant play records for creator rewards. PiXFiND is the
-- first consumer; other games can register content in the same catalogue.

alter table public.pixfind_puzzles
  add column if not exists creator_user_id uuid references auth.users(id) on delete set null;
alter table public.pixfind_puzzles
  add column if not exists valid_play_count bigint not null default 0 check (valid_play_count >= 0);

create index if not exists pixfind_puzzles_creator_user_idx
  on public.pixfind_puzzles(creator_user_id, created_at desc);

create table if not exists public.creator_reward_contents (
  app_key text not null check (app_key ~ '^[a-z0-9][a-z0-9_-]{1,31}$'),
  content_key text not null check (char_length(content_key) between 1 and 160),
  creator_user_id uuid references auth.users(id) on delete set null,
  label text not null default '',
  active boolean not null default true,
  valid_play_count bigint not null default 0 check (valid_play_count >= 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (app_key, content_key)
);

create table if not exists public.creator_play_events (
  id bigint generated always as identity primary key,
  app_key text not null,
  content_key text not null,
  creator_user_id uuid references auth.users(id) on delete set null,
  play_day date not null,
  viewer_key_hash text not null check (viewer_key_hash ~ '^[0-9a-f]{64}$'),
  viewer_user_id uuid references auth.users(id) on delete set null,
  engaged_seconds smallint not null check (engaged_seconds between 10 and 3600),
  status text not null default 'valid' check (status in ('valid', 'rejected')),
  created_at timestamptz not null default timezone('utc', now()),
  foreign key (app_key, content_key)
    references public.creator_reward_contents(app_key, content_key) on delete restrict,
  unique (app_key, content_key, play_day, viewer_key_hash)
);

create index if not exists creator_play_events_month_idx
  on public.creator_play_events(play_day, status, app_key, content_key);
create index if not exists creator_play_events_creator_idx
  on public.creator_play_events(creator_user_id, play_day desc)
  where status = 'valid' and creator_user_id is not null;
create index if not exists creator_play_events_viewer_day_idx
  on public.creator_play_events(viewer_key_hash, play_day);

alter table public.creator_reward_contents enable row level security;
alter table public.creator_play_events enable row level security;
revoke all on public.creator_reward_contents from public, anon, authenticated;
revoke all on public.creator_play_events from public, anon, authenticated;

create or replace function public.pixfind_assign_creator_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.creator_user_id := auth.uid();
    new.valid_play_count := 0;
  elsif old.creator_user_id is null and new.creator_user_id = auth.uid() then
    new.valid_play_count := old.valid_play_count;
  elsif new.creator_user_id is distinct from old.creator_user_id then
    new.creator_user_id := old.creator_user_id;
  end if;
  if tg_op = 'UPDATE'
     and coalesce(current_setting('app.creator_play_counter_update', true), '') <> 'true' then
    new.valid_play_count := old.valid_play_count;
  end if;
  return new;
end;
$$;

drop trigger if exists pixfind_puzzles_assign_creator_user on public.pixfind_puzzles;
create trigger pixfind_puzzles_assign_creator_user
before insert or update on public.pixfind_puzzles
for each row execute function public.pixfind_assign_creator_user();

create or replace function public.pixfind_sync_reward_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.creator_reward_contents
    set active = false, updated_at = timezone('utc', now())
    where app_key = 'pixfind' and content_key = old.id;
    return old;
  end if;

  insert into public.creator_reward_contents(
    app_key, content_key, creator_user_id, label, active, valid_play_count, metadata
  ) values (
    'pixfind', new.id, new.creator_user_id, new.label, true, new.valid_play_count,
    jsonb_build_object('difficulty', new.difficulty, 'mode', coalesce(new.mode, new.game_mode, new.play_mode, 'difference'))
  )
  on conflict (app_key, content_key) do update set
    creator_user_id = excluded.creator_user_id,
    label = excluded.label,
    active = true,
    metadata = excluded.metadata,
    updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists pixfind_puzzles_sync_reward_content on public.pixfind_puzzles;
create trigger pixfind_puzzles_sync_reward_content
after insert or update or delete on public.pixfind_puzzles
for each row execute function public.pixfind_sync_reward_content();

insert into public.creator_reward_contents(
  app_key, content_key, creator_user_id, label, active, valid_play_count, metadata
)
select 'pixfind', puzzle.id, puzzle.creator_user_id, puzzle.label, true, puzzle.valid_play_count,
       jsonb_build_object('difficulty', puzzle.difficulty, 'mode', coalesce(puzzle.mode, puzzle.game_mode, puzzle.play_mode, 'difference'))
from public.pixfind_puzzles puzzle
on conflict (app_key, content_key) do update set
  creator_user_id = excluded.creator_user_id,
  label = excluded.label,
  active = true,
  metadata = excluded.metadata,
  updated_at = timezone('utc', now());

create or replace function public.pixfind_claim_my_puzzles_v1()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_client_id text := public.request_client_id();
  v_count integer;
begin
  if v_user_id is null then raise exception 'login required'; end if;
  if nullif(btrim(v_client_id), '') is null then raise exception 'client id required'; end if;

  update public.pixfind_puzzles
  set creator_user_id = v_user_id
  where client_id = v_client_id and creator_user_id is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.creator_record_valid_play_v1(
  input_app_key text,
  input_content_key text,
  input_viewer_key_hash text,
  input_engaged_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content public.creator_reward_contents%rowtype;
  v_today date := (timezone('utc', now()))::date;
  v_inserted integer := 0;
begin
  if coalesce(lower(input_viewer_key_hash), '') !~ '^[0-9a-f]{64}$' then
    raise exception 'valid anonymous viewer key is required';
  end if;
  if input_engaged_seconds is null or input_engaged_seconds < 10 or input_engaged_seconds > 3600 then
    raise exception 'engaged play time must be between 10 and 3600 seconds';
  end if;

  select * into v_content
  from public.creator_reward_contents
  where app_key = lower(btrim(input_app_key))
    and content_key = btrim(input_content_key)
    and active
  for update;
  if not found then return jsonb_build_object('accepted', false, 'reason', 'content-not-reward-eligible'); end if;

  if auth.uid() is not null and v_content.creator_user_id = auth.uid() then
    return jsonb_build_object('accepted', false, 'reason', 'creator-self-play');
  end if;
  if (
    select count(*) from public.creator_play_events
    where viewer_key_hash = lower(input_viewer_key_hash) and play_day = v_today
  ) >= 100 then
    return jsonb_build_object('accepted', false, 'reason', 'daily-play-limit');
  end if;

  insert into public.creator_play_events(
    app_key, content_key, creator_user_id, play_day,
    viewer_key_hash, viewer_user_id, engaged_seconds, status
  ) values (
    v_content.app_key, v_content.content_key, v_content.creator_user_id, v_today,
    lower(input_viewer_key_hash), auth.uid(), input_engaged_seconds, 'valid'
  ) on conflict (app_key, content_key, play_day, viewer_key_hash) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    update public.creator_reward_contents
    set valid_play_count = valid_play_count + 1, updated_at = timezone('utc', now())
    where app_key = v_content.app_key and content_key = v_content.content_key;
    if v_content.app_key = 'pixfind' then
      perform set_config('app.creator_play_counter_update', 'true', true);
      update public.pixfind_puzzles
      set valid_play_count = valid_play_count + 1
      where id = v_content.content_key;
      perform set_config('app.creator_play_counter_update', '', true);
    end if;
  end if;

  return jsonb_build_object(
    'accepted', v_inserted = 1,
    'reason', case when v_inserted = 1 then 'recorded' else 'already-recorded-today' end
  );
end;
$$;

create or replace function public.creator_my_play_stats_v1()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total_valid_plays', coalesce(sum(valid_play_count), 0),
    'contents', coalesce(jsonb_agg(jsonb_build_object(
      'app_key', app_key,
      'content_key', content_key,
      'label', label,
      'valid_play_count', valid_play_count
    ) order by valid_play_count desc, updated_at desc), '[]'::jsonb)
  )
  from public.creator_reward_contents
  where creator_user_id = auth.uid();
$$;

revoke all on function public.pixfind_claim_my_puzzles_v1() from public, anon, authenticated;
revoke all on function public.creator_record_valid_play_v1(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.creator_my_play_stats_v1() from public, anon, authenticated;
grant execute on function public.pixfind_claim_my_puzzles_v1() to authenticated;
grant execute on function public.creator_record_valid_play_v1(text, text, text, integer) to anon, authenticated;
grant execute on function public.creator_my_play_stats_v1() to authenticated;
