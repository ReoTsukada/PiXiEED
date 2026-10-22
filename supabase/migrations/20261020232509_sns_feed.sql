-- Private server-owned feed data. All browser direct access is denied, including owner reads.
-- Reads and writes go through a verified Edge Function and service-only RPC.
create table public.sns_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  media_owner_id uuid not null references auth.users(id) on delete restrict,
  request_key uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  kind text not null check (kind in ('text', 'music')),
  title text not null check (char_length(title) between 1 and 60),
  body text not null check (char_length(body) <= 180),
  author_name text not null check (char_length(author_name) between 1 and 40),
  visibility text not null check (visibility in ('public', 'private')),
  state text not null check (state in ('pending', 'ready', 'deleted')),
  audio_bytes integer check (audio_bytes between 1 and 16777216),
  audio_duration numeric check (audio_duration > 0 and audio_duration <= 600),
  audio_sha256 text check (audio_sha256 ~ '^[0-9a-f]{64}$'),
  cleanup_pending boolean not null default false,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, request_key),
  check ((kind = 'text' and char_length(btrim(body)) > 0 and audio_bytes is null and audio_duration is null and audio_sha256 is null)
    or (kind = 'music' and audio_bytes is not null and audio_duration is not null and audio_sha256 is not null)),
  check (state <> 'ready' or kind = 'text' or audio_sha256 is not null)
);
create index sns_posts_public_feed_idx on public.sns_posts (created_at desc, id desc)
  where state = 'ready' and visibility = 'public';
create index sns_posts_owner_idx on public.sns_posts (owner_id, created_at desc, id desc);

create table public.sns_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete restrict,
  target text not null check (target ~ '^(sns|map|showcase):[0-9a-f-]{36}$'),
  reason text not null check (reason in ('copyright', 'harmful', 'spam', 'other')),
  details text not null default '' check (char_length(details) <= 500),
  created_at timestamptz not null default now(),
  unique (reporter_id, target)
);

alter table public.sns_posts enable row level security;
alter table public.sns_reports enable row level security;
revoke all on public.sns_posts, public.sns_reports from public, anon, authenticated;
grant select, insert, update, delete on public.sns_posts, public.sns_reports to service_role;

create function public.pixieed_sns_immutable_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.media_owner_id is distinct from old.media_owner_id
    or new.request_key is distinct from old.request_key or new.request_hash is distinct from old.request_hash
    or new.created_at is distinct from old.created_at then
    raise exception 'sns_identity_immutable';
  end if;
  if new.owner_id is distinct from old.owner_id and not exists (
    select 1 from public.sns_guest_claims where guest_id=old.owner_id and owner_id=new.owner_id
  ) then raise exception 'sns_identity_immutable'; end if;
  if tg_table_name = 'sns_posts' then
    if new.kind is distinct from old.kind or new.audio_bytes is distinct from old.audio_bytes
      or new.audio_duration is distinct from old.audio_duration or new.audio_sha256 is distinct from old.audio_sha256 then
      raise exception 'sns_media_immutable';
    end if;
    if old.state = 'deleted' and new.state <> 'deleted' then raise exception 'sns_post_tombstone_immutable'; end if;
    if old.state = 'ready' and new.state = 'pending' then raise exception 'sns_post_state_invalid'; end if;
  end if;
  return new;
end;
$$;
create trigger sns_posts_immutable_identity before update on public.sns_posts
  for each row execute function public.pixieed_sns_immutable_identity();

create function public.pixieed_sns_public_target(p_target text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_type text; v_id uuid; v_visible boolean := false;
begin
  if p_target is null or p_target !~ '^(sns|map|showcase):[0-9a-f-]{36}$' then return false; end if;
  v_type := split_part(p_target, ':', 1); v_id := split_part(p_target, ':', 2)::uuid;
  if v_type = 'sns' then
    select true into v_visible from public.sns_posts where id=v_id and state='ready' and visibility='public' for share;
  elsif v_type = 'map' then
    select true into v_visible from public.post_map_points m join public.user_posts p on p.id=m.post_id
      where m.post_id=v_id and m.published_at is not null and p.status='published' for share of m,p;
  elsif v_type = 'showcase' and to_regclass('public.social_posts') is not null then
    execute 'select true from public.social_posts where id=$1 and status=$2 and post_kind=$3 and distribution_mode=$4 and media_object_path is not null for share'
      into v_visible using v_id, 'published', 'image', 'showcase';
  end if;
  return coalesce(v_visible,false);
exception when others then return false;
end;
$$;

create function public.pixieed_sns_reserve_post(
  p_owner_id uuid, p_request_key uuid, p_request_hash text, p_kind text,
  p_title text, p_body text, p_author_name text, p_visibility text,
  p_audio_bytes integer default null, p_audio_duration numeric default null, p_audio_sha256 text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_row public.sns_posts%rowtype; v_now timestamptz := clock_timestamp();
begin
  if p_owner_id is null or p_request_key is null or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
    or p_kind is null or p_kind not in ('text','music') or p_visibility is null or p_visibility not in ('public','private')
    or p_title is null or char_length(p_title) not between 1 and 60 or p_body is null or char_length(p_body) > 180
    or (p_kind='text' and char_length(btrim(p_body)) < 1)
    or p_author_name is null or char_length(p_author_name) not between 1 and 40 then raise exception 'sns_input_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('sns-post:' || p_owner_id::text, 0));
  select * into v_row from public.sns_posts where owner_id = p_owner_id and request_key = p_request_key for update;
  if found then
    if v_row.request_hash <> p_request_hash then raise exception 'sns_idempotency_conflict'; end if;
    return jsonb_build_object('postId',v_row.id,'state',v_row.state,'replayed',true);
  end if;
  if (select count(*) from public.sns_posts where owner_id = p_owner_id and created_at > v_now - interval '1 hour') >= 20 then raise exception 'sns_post_rate_limited'; end if;
  if p_kind = 'music' then
    if p_audio_bytes is null or p_audio_bytes not between 1 and 16777216 or p_audio_duration is null or p_audio_duration <= 0 or p_audio_duration > 600 or p_audio_sha256 is null or p_audio_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'sns_audio_invalid'; end if;
    if coalesce((select sum(audio_bytes) from public.sns_posts where owner_id = p_owner_id and (state <> 'deleted' or cleanup_pending)),0) + p_audio_bytes > 134217728 then raise exception 'sns_music_capacity'; end if;
  elsif p_audio_bytes is not null or p_audio_duration is not null or p_audio_sha256 is not null then raise exception 'sns_audio_invalid'; end if;
  insert into public.sns_posts(owner_id,media_owner_id,request_key,request_hash,kind,title,body,author_name,visibility,state,audio_bytes,audio_duration,audio_sha256)
  values(p_owner_id,p_owner_id,p_request_key,p_request_hash,p_kind,p_title,p_body,p_author_name,p_visibility,case when p_kind='music' then 'pending' else 'ready' end,p_audio_bytes,p_audio_duration,p_audio_sha256)
  returning * into v_row;
  return jsonb_build_object('postId',v_row.id,'state',v_row.state,'replayed',false);
end;
$$;

create function public.pixieed_sns_finish_audio(p_owner_id uuid,p_post_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.sns_posts set state='ready',updated_at=now(),version=version+1
   where id=p_post_id and owner_id=p_owner_id and kind='music' and state='pending';
  if found then return true; end if;
  return exists(select 1 from public.sns_posts where id=p_post_id and owner_id=p_owner_id and kind='music' and state='ready');
end;
$$;

create function public.pixieed_sns_report(p_reporter_id uuid,p_target text,p_reason text,p_details text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_now timestamptz := clock_timestamp();
begin
  if p_reporter_id is null or p_target is null or p_target !~ '^(sns|map|showcase):[0-9a-f-]{36}$' or p_reason is null or p_reason not in ('copyright','harmful','spam','other') or p_details is null or char_length(p_details)>500 then raise exception 'sns_report_invalid'; end if;
  if not public.pixieed_sns_public_target(p_target) then raise exception 'sns_target_not_public'; end if;
  perform pg_advisory_xact_lock(hashtextextended('sns-report:' || p_reporter_id::text, 0));
  if exists(select 1 from public.sns_reports where reporter_id=p_reporter_id and target=p_target) then return true; end if;
  if (select count(*) from public.sns_reports where reporter_id=p_reporter_id and created_at > v_now - interval '1 hour') >= 20 then raise exception 'sns_report_rate_limited'; end if;
  insert into public.sns_reports(reporter_id,target,reason,details) values(p_reporter_id,p_target,p_reason,p_details) on conflict (reporter_id,target) do nothing;
  return true;
end;
$$;

revoke all on function public.pixieed_sns_immutable_identity() from public, anon, authenticated;
revoke all on function public.pixieed_sns_public_target(text) from public, anon, authenticated;
revoke all on function public.pixieed_sns_reserve_post(uuid,uuid,text,text,text,text,text,text,integer,numeric,text) from public, anon, authenticated;
revoke all on function public.pixieed_sns_finish_audio(uuid,uuid) from public, anon, authenticated;
revoke all on function public.pixieed_sns_report(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.pixieed_sns_reserve_post(uuid,uuid,text,text,text,text,text,text,integer,numeric,text) to service_role;
grant execute on function public.pixieed_sns_finish_audio(uuid,uuid) to service_role;
grant execute on function public.pixieed_sns_report(uuid,text,text,text) to service_role;
grant execute on function public.pixieed_sns_public_target(text) to service_role;

do $$ begin
  if exists(select 1 from storage.buckets where id='sns-audio' and public) then raise exception 'sns_audio_bucket_must_be_private'; end if;
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('sns-audio','sns-audio',false,16777216,array['audio/wav']) on conflict (id) do nothing;
end $$;
