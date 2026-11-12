set local lock_timeout = '5s';
set local statement_timeout = '30s';
-- Operator review only. Does not opt anyone in, grant admin access, or seed approvals.
alter table public.home_artwork_reviews
  add column revision bigint not null default 1,
  add column reviewed_by uuid references auth.users(id) on delete set null;
create table public.home_artwork_review_events (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.user_posts(id) on delete cascade,
  reviewer_id uuid references auth.users(id) on delete set null,
  action text not null check(action in ('approve','hold')),
  snapshot_token text not null check(snapshot_token ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.home_artwork_review_events enable row level security;
revoke all on public.home_artwork_review_events from public,anon,authenticated,service_role;
grant select,insert on public.home_artwork_review_events to service_role;
revoke all on sequence public.home_artwork_review_events_id_seq from public,anon,authenticated,service_role;
grant usage,select on sequence public.home_artwork_review_events_id_seq to service_role;

-- Private projection: no owner ID, private path, coordinates, email or notes leave SQL.
-- Snapshot covers ownership, consent revision, current public metadata and prior review.
create function public.pixieed_home_review_candidates()
returns table(post_id uuid,item jsonb) language sql stable security invoker set search_path='' as $$
  with records as (
    select p.id,to_jsonb(p) as post,to_jsonb(m) as point,to_jsonb(c) as consent,to_jsonb(r) as review,
      coalesce(c.enabled and c.consent_version='home-artwork-v1' and c.accepted_at is not null
        and p.status='published' and p.published_at is not null and p.deleted_at is null
        and m.published_at is not null and m.map_space='globe'
        and p.post_kind in ('pixel_art','pixel_camera') and m.post_kind=p.post_kind
        and p.submission_puzzle_mode is null and m.puzzle_mode is null
        and m.public_image_path ~ ('^'||p.id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$')
        and p.image_mime='image/png' and p.image_bytes between 1 and 262144
        and not exists(select 1 from public.sns_guest_claims g where g.guest_id=coalesce(p.media_author_id,p.author_id)
          and (g.owner_id<>p.author_id or c.accepted_at<g.created_at)),false) as eligible
    from public.user_posts p
    left join public.home_artwork_preferences c on c.owner_id=p.author_id
    left join public.post_map_points m on m.post_id=p.id
    left join public.home_artwork_reviews r on r.post_id=p.id
  )
  select id,jsonb_build_object('id','map:'||id::text,'postId',id,'eligible',eligible,
    'title',case when eligible then post->>'title' else review->>'title' end,
    'authorName',coalesce(case when eligible then post->>'author_name' else review->>'author_name' end,''),
    'reviewState',case
      when review is null then 'pending'
      when eligible and (review->>'image_path' is distinct from point->>'public_image_path'
        or review->'image_bytes' is distinct from post->'image_bytes'
        or review->>'image_sha256' is distinct from post->>'content_hash'
        or review->>'title' is distinct from post->>'title'
        or review->>'author_name' is distinct from coalesce(post->>'author_name','')) then 'pending'
      when (review->>'approved')::boolean and (review->>'still_image')::boolean then 'approved' else 'held' end,
    'snapshotToken',encode(sha256(convert_to(jsonb_build_array(post,point,consent,review)::text,'UTF8')),'hex'))
    || case when eligible then jsonb_build_object('imagePath',point->>'public_image_path',
      'imageBytes',post->'image_bytes','imageSha256',post->>'content_hash','publishedAt',post->>'published_at') else '{}'::jsonb end
  from records where eligible or review is not null;
$$;
create function public.pixieed_home_review_list(p_state text default 'all',p_after uuid default null,p_limit integer default 24)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_items jsonb; v_count integer;
begin
  if p_state is null or p_state not in ('all','pending','approved','held') or p_limit is null or p_limit not between 1 and 24 then raise exception 'review_input_invalid'; end if;
  select coalesce(jsonb_agg(item order by post_id),'[]'::jsonb),count(*) into v_items,v_count from (
    select post_id,item from public.pixieed_home_review_candidates()
    where (p_after is null or post_id>p_after) and (p_state='all' or item->>'reviewState'=p_state)
    order by post_id limit p_limit+1
  ) page;
  return jsonb_build_object('artworks',case when v_count>p_limit then v_items-p_limit else v_items end,
    'nextCursor',case when v_count>p_limit then v_items->(p_limit-1)->>'postId' else null end);
end;
$$;
create function public.pixieed_home_review_item(p_post_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select item from public.pixieed_home_review_candidates() where post_id=p_post_id;
$$;
create function public.pixieed_home_review_save(p_post_id uuid,p_action text,p_snapshot_token text,p_reviewer_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_owner uuid; v_post public.user_posts%rowtype; v_item jsonb;
begin
  if p_post_id is null or p_reviewer_id is null or p_action is null or p_action not in ('approve','hold')
    or p_snapshot_token is null or p_snapshot_token !~ '^[0-9a-f]{64}$' then raise exception 'review_input_invalid'; end if;
  select author_id into v_owner from public.user_posts where id=p_post_id;
  if v_owner is null then raise exception 'review_conflict'; end if;
  -- Same owner lock as preference/guest claim, before row locks. Claim cannot
  -- transfer the post while consent/ownership/publication are being checked.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sns-post:'||v_owner::text,0));
  select * into v_post from public.user_posts where id=p_post_id for update;
  if not found or v_post.author_id<>v_owner then raise exception 'review_conflict'; end if;
  perform 1 from public.home_artwork_preferences where owner_id=v_owner for update;
  perform 1 from public.post_map_points where post_id=p_post_id for update;
  perform 1 from public.home_artwork_reviews where post_id=p_post_id for update;
  v_item:=public.pixieed_home_review_item(p_post_id);
  if v_item is null or v_item->>'snapshotToken' is distinct from p_snapshot_token then raise exception 'review_conflict'; end if;
  if p_action='approve' and (v_item->>'eligible')::boolean is not true then raise exception 'review_conflict'; end if;
  if p_action='approve' and (char_length(btrim(v_item->>'title')) not between 1 and 60
    or char_length(btrim(v_item->>'authorName')) not between 1 and 40
    or v_item->>'title' ~ '[[:cntrl:]]' or v_item->>'authorName' ~ '[[:cntrl:]]') then raise exception 'public_display_name_required'; end if;
  if (v_item->>'eligible')::boolean is not true then
    -- Cancellation stays available after opt-out, deletion, metadata changes or claim.
    -- Preserve the last reviewed public metadata; never re-expose its image.
    update public.home_artwork_reviews set approved=false,reviewed_by=p_reviewer_id,
      reviewed_at=clock_timestamp(),revision=revision+1 where post_id=p_post_id;
    if not found then raise exception 'review_conflict'; end if;
  else
  insert into public.home_artwork_reviews(post_id,approved,still_image,image_path,image_bytes,image_sha256,title,author_name,reviewed_by,reviewed_at)
    values(p_post_id,p_action='approve',p_action='approve',v_item->>'imagePath',(v_item->>'imageBytes')::integer,
      v_item->>'imageSha256',v_item->>'title',v_item->>'authorName',p_reviewer_id,clock_timestamp())
    on conflict(post_id) do update set approved=excluded.approved,still_image=excluded.still_image,
      image_path=excluded.image_path,image_bytes=excluded.image_bytes,image_sha256=excluded.image_sha256,
      title=excluded.title,author_name=excluded.author_name,reviewed_by=excluded.reviewed_by,
      reviewed_at=excluded.reviewed_at,revision=home_artwork_reviews.revision+1;
  end if;
  insert into public.home_artwork_review_events(post_id,reviewer_id,action,snapshot_token)
    values(p_post_id,p_reviewer_id,p_action,p_snapshot_token);
  return jsonb_build_object('postId',p_post_id,'reviewState',case when p_action='approve' then 'approved' else 'held' end);
end;
$$;
revoke all on function public.pixieed_home_review_candidates() from public,anon,authenticated;
revoke all on function public.pixieed_home_review_list(text,uuid,integer) from public,anon,authenticated;
revoke all on function public.pixieed_home_review_item(uuid) from public,anon,authenticated;
revoke all on function public.pixieed_home_review_save(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.pixieed_home_review_candidates() to service_role;
grant execute on function public.pixieed_home_review_list(text,uuid,integer) to service_role;
grant execute on function public.pixieed_home_review_item(uuid) to service_role;
grant execute on function public.pixieed_home_review_save(uuid,text,text,uuid) to service_role;
