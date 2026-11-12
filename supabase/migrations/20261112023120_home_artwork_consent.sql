set local lock_timeout = '5s';
set local statement_timeout = '30s';
-- Explicit per-owner opt-in. No existing posting receipts are changed or inferred.
create table public.home_artwork_preferences (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  consent_version text,
  accepted_at timestamptz,
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  check (not enabled or (consent_version is not null and consent_version = 'home-artwork-v1' and accepted_at is not null))
);
create table public.home_artwork_reviews (
  post_id uuid primary key references public.user_posts(id) on delete cascade,
  approved boolean not null default false,
  still_image boolean not null default false,
  image_path text not null,
  image_bytes integer not null check (image_bytes between 1 and 262144),
  image_sha256 text not null check (image_sha256 ~ '^[0-9a-f]{64}$'),
  title text not null,
  author_name text not null,
  reviewed_at timestamptz not null default now(),
  reviewer_note text not null default ''
);
alter table public.home_artwork_preferences enable row level security;
alter table public.home_artwork_reviews enable row level security;
revoke all on public.home_artwork_preferences, public.home_artwork_reviews from public, anon, authenticated;
grant select, insert, update, delete on public.home_artwork_preferences, public.home_artwork_reviews to service_role;

create function public.pixieed_home_artwork_preference(p_owner_id uuid, p_enabled boolean default null, p_revision bigint default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v public.home_artwork_preferences%rowtype; v_claim timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sns-post:' || p_owner_id::text, 0));
  if exists(select 1 from public.sns_guest_claims where guest_id=p_owner_id) then
    raise exception 'guest_claimed';
  end if;
  select * into v from public.home_artwork_preferences where owner_id=p_owner_id for update;
  if p_enabled is not null then
    if p_revision is null or p_revision <> coalesce(v.revision,0) then raise exception 'preference_conflict'; end if;
    insert into public.home_artwork_preferences(owner_id,enabled,consent_version,accepted_at)
      values(p_owner_id,p_enabled,case when p_enabled then 'home-artwork-v1' end,case when p_enabled then clock_timestamp() end)
    on conflict(owner_id) do update set enabled=excluded.enabled,
      consent_version=case when excluded.enabled then excluded.consent_version else home_artwork_preferences.consent_version end,
      accepted_at=case when excluded.enabled then excluded.accepted_at else home_artwork_preferences.accepted_at end,
      updated_at=clock_timestamp(),revision=home_artwork_preferences.revision+1
    returning * into v;
  end if;
  select max(created_at) into v_claim from public.sns_guest_claims where owner_id=p_owner_id;
  return jsonb_build_object('enabled',coalesce(v.enabled,false),'consentVersion','home-artwork-v1',
    'revision',coalesce(v.revision,0),'needsReconfirmation',coalesce(v.enabled and v_claim > v.accepted_at,false));
end;
$$;
revoke all on function public.pixieed_home_artwork_preference(uuid,boolean,bigint) from public,anon,authenticated;
grant execute on function public.pixieed_home_artwork_preference(uuid,boolean,bigint) to service_role;

create function public.pixieed_home_artworks()
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(item),'[]'::jsonb) from (
    select jsonb_build_object('id','map:' || p.id::text,'title',p.title,
      'authorName',coalesce(p.author_name,''),'imagePath',m.public_image_path,
      'imageBytes',p.image_bytes,'imageSha256',p.content_hash,'publishedAt',p.published_at) item
    from public.user_posts p
    join public.home_artwork_preferences c on c.owner_id=p.author_id
    join public.home_artwork_reviews r on r.post_id=p.id
    join public.post_map_points m on m.post_id=p.id
    where c.enabled and c.consent_version='home-artwork-v1' and c.accepted_at is not null
      and p.status='published' and p.published_at is not null and p.deleted_at is null
      and m.published_at is not null and m.map_space='globe'
      and p.post_kind in ('pixel_art','pixel_camera') and m.post_kind=p.post_kind
      and p.submission_puzzle_mode is null and m.puzzle_mode is null
      and m.public_image_path ~ ('^' || p.id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$')
      and p.image_mime='image/png' and p.image_bytes between 1 and 262144
      and r.approved and r.still_image and r.image_path=m.public_image_path
      and r.image_bytes=p.image_bytes and r.image_sha256=p.content_hash
      and r.title=p.title and r.author_name=coalesce(p.author_name,'')
      and not exists(select 1 from public.sns_guest_claims g where g.guest_id=coalesce(p.media_author_id,p.author_id)
        and (g.owner_id<>p.author_id or c.accepted_at<g.created_at))
    order by random() limit 24
  ) candidates;
$$;
revoke all on function public.pixieed_home_artworks() from public,anon,authenticated;
grant execute on function public.pixieed_home_artworks() to service_role;
