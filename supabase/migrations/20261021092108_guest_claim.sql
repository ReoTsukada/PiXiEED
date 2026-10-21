-- Retain claim identities pending an explicit retention policy decision. Claiming
-- changes authorship; storage paths and immutable media-owner columns stay put.
alter table public.user_posts
  add column if not exists media_author_id uuid references auth.users(id) on delete restrict;

alter table public.sns_posts
  add column if not exists media_owner_id uuid references auth.users(id) on delete restrict;
update public.sns_posts set media_owner_id = owner_id where media_owner_id is null;
alter table public.sns_posts alter column media_owner_id set not null;

create table public.sns_guest_claims (
  guest_id uuid primary key references auth.users(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  request_key uuid not null,
  user_post_count integer not null check (user_post_count >= 0),
  sns_post_count integer not null check (sns_post_count >= 0),
  created_at timestamptz not null default now(),
  unique (owner_id, request_key),
  check (guest_id <> owner_id)
);
alter table public.sns_guest_claims enable row level security;
revoke all on table public.sns_guest_claims from public, anon, authenticated;
grant select, insert, update, delete on table public.sns_guest_claims to service_role;

-- New writes synchronize with claims under the same per-owner lock namespace used
-- by pixieed_sns_reserve_post. This closes the claim/create race for both tables.
create function public.pixieed_sns_reject_claimed_guest_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_owner uuid;
begin
  if tg_table_name = 'sns_posts' then
    v_owner := new.owner_id;
    new.media_owner_id := new.owner_id;
  else v_owner := new.author_id;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sns-post:' || v_owner::text, 0));
  if exists (select 1 from public.sns_guest_claims where guest_id = v_owner) then
    raise exception 'sns_guest_claimed' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.pixieed_sns_reject_claimed_guest_write() from public, anon, authenticated;
grant execute on function public.pixieed_sns_reject_claimed_guest_write() to service_role;
create trigger sns_posts_reject_claimed_guest_write before insert on public.sns_posts
  for each row execute function public.pixieed_sns_reject_claimed_guest_write();
create trigger user_posts_reject_claimed_guest_write before insert on public.user_posts
  for each row execute function public.pixieed_sns_reject_claimed_guest_write();

-- The only allowed sns_posts owner move is the atomic, recorded guest claim.
create or replace function public.pixieed_sns_immutable_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.request_key is distinct from old.request_key
    or new.request_hash is distinct from old.request_hash or new.created_at is distinct from old.created_at then
    raise exception 'sns_identity_immutable';
  end if;
  if new.media_owner_id is distinct from old.media_owner_id then raise exception 'sns_media_owner_immutable'; end if;
  if new.owner_id is distinct from old.owner_id and not exists (
    select 1 from public.sns_guest_claims c where c.guest_id=old.owner_id and c.owner_id=new.owner_id
  ) then raise exception 'sns_identity_immutable'; end if;
  if new.kind is distinct from old.kind or new.audio_bytes is distinct from old.audio_bytes
    or new.audio_duration is distinct from old.audio_duration or new.audio_sha256 is distinct from old.audio_sha256 then
    raise exception 'sns_media_immutable';
  end if;
  if old.state = 'deleted' and new.state <> 'deleted' then raise exception 'sns_post_tombstone_immutable'; end if;
  if old.state = 'ready' and new.state = 'pending' then raise exception 'sns_post_state_invalid'; end if;
  return new;
end;
$$;

-- Existing user_posts rows have a NULL media_author_id. Claiming may initialize it
-- to the former author exactly once, and only alongside a recorded author transfer.
create function public.pixieed_user_post_claim_identity()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.media_author_id is distinct from old.media_author_id or new.author_id is distinct from old.author_id then
    if new.author_id is not distinct from old.author_id
      or new.media_author_id is distinct from coalesce(old.media_author_id, old.author_id)
      or not exists (select 1 from public.sns_guest_claims c
        where c.guest_id=old.author_id and c.owner_id=new.author_id) then
      raise exception 'user_post_identity_immutable';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.pixieed_user_post_claim_identity() from public, anon, authenticated;
grant execute on function public.pixieed_user_post_claim_identity() to service_role;
create trigger user_posts_claim_identity before update of author_id, media_author_id on public.user_posts
  for each row execute function public.pixieed_user_post_claim_identity();

create function public.pixieed_sns_claim_guest(
  p_guest_id uuid, p_owner_id uuid, p_request_key uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_claim public.sns_guest_claims%rowtype;
  v_guest_count integer;
  v_sns_count integer;
  v_guest_bytes bigint;
  v_owner_bytes bigint;
  v_lock_id uuid;
begin
  if p_guest_id is null or p_owner_id is null or p_request_key is null or p_guest_id = p_owner_id then
    raise exception 'sns_claim_identity' using errcode = '22023';
  end if;
  -- Keep lock order deterministic and use the reserve function's namespace.
  for v_lock_id in select x from unnest(array[p_guest_id,p_owner_id]) as u(x) order by x loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sns-post:' || v_lock_id::text, 0));
  end loop;
  -- Both IDs/anonymity states are independently verified with Auth getUser by
  -- the service-only Edge handler. No broad service_role read of auth.users is granted.
  -- Foreign keys ensure identities still exist; UUIDs from browsers are never trusted.
  select * into v_claim from public.sns_guest_claims where guest_id=p_guest_id for update;
  if found then
    if v_claim.owner_id=p_owner_id and v_claim.request_key=p_request_key then
      return jsonb_build_object('claimed',true,'replayed',true,'guestId',p_guest_id,'ownerId',p_owner_id,'requestKey',p_request_key,'userPostCount',v_claim.user_post_count,'snsPostCount',v_claim.sns_post_count);
    end if;
    raise exception 'sns_guest_claimed' using errcode = '23505';
  end if;
  if exists(select 1 from public.sns_guest_claims where owner_id=p_owner_id and request_key=p_request_key) then
    raise exception 'sns_claim_conflict' using errcode = '23505';
  end if;
  -- Freeze matched rows before checking pending states, capacities, and conflicts.
  perform 1 from public.sns_posts where owner_id in (p_guest_id,p_owner_id) order by id for update;
  perform 1 from public.user_posts where author_id in (p_guest_id,p_owner_id) order by id for update;
  if exists(select 1 from public.sns_posts where owner_id=p_guest_id and kind='music' and state='pending')
    or exists(select 1 from public.user_posts where author_id=p_guest_id and status='pending') then
    raise exception 'sns_claim_pending' using errcode = '55000';
  end if;
  select coalesce(sum(audio_bytes),0) into v_guest_bytes from public.sns_posts
    where owner_id=p_guest_id and kind='music' and (state <> 'deleted' or cleanup_pending);
  select coalesce(sum(audio_bytes),0) into v_owner_bytes from public.sns_posts
    where owner_id=p_owner_id and kind='music' and (state <> 'deleted' or cleanup_pending);
  if v_guest_bytes+v_owner_bytes > 134217728 then raise exception 'sns_music_capacity' using errcode = '23514'; end if;

  if exists(select 1 from public.sns_posts g join public.sns_posts o on o.request_key=g.request_key
      where g.owner_id=p_guest_id and o.owner_id=p_owner_id)
    or exists(select 1 from public.user_posts g join public.user_posts o on o.request_key=g.request_key
      where g.author_id=p_guest_id and o.author_id=p_owner_id and g.request_key is not null) then
    raise exception 'sns_claim_conflict' using errcode = '23505';
  end if;
  select count(*) into v_sns_count from public.sns_posts where owner_id=p_guest_id;
  select count(*) into v_guest_count from public.user_posts where author_id=p_guest_id;
  -- Insert the authoritative claim first; the SNS immutability trigger checks this row.
  insert into public.sns_guest_claims(guest_id,owner_id,request_key,user_post_count,sns_post_count)
    values(p_guest_id,p_owner_id,p_request_key,v_guest_count,v_sns_count);
  update public.user_posts set media_author_id=coalesce(media_author_id,author_id), author_id=p_owner_id, updated_at=now()
    where author_id=p_guest_id;
  update public.sns_posts set owner_id=p_owner_id, updated_at=now(), version=version+1
    where owner_id=p_guest_id;
  return jsonb_build_object('claimed',true,'replayed',false,'guestId',p_guest_id,'ownerId',p_owner_id,'requestKey',p_request_key,'userPostCount',v_guest_count,'snsPostCount',v_sns_count);
end;
$$;
revoke all on function public.pixieed_sns_claim_guest(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.pixieed_sns_claim_guest(uuid,uuid,uuid) to service_role;

create or replace function public.pixieed_delete_own_post(
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

  if v_post.image_path !~ ('^' || coalesce(v_post.media_author_id, v_post.author_id)::text || '/' || p_post_id::text || '\.(png|webp)$') then
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
      if v_puzzle.changed_image_path !~ ('^' || coalesce(v_post.media_author_id, v_post.author_id)::text || '/' || p_post_id::text || '-changed\.png$') then
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

create or replace function public.pixieed_complete_own_post_delete(
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
