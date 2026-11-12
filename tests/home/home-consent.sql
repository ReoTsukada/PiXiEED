-- Isolated PostgreSQL harness only. Minimal existing-schema fixtures; never run on production.
\set ON_ERROR_STOP on
begin;
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create table public.user_posts(id uuid primary key,author_id uuid,media_author_id uuid,title text,author_name text,image_path text,image_bytes integer,content_hash text,image_mime text,status text,published_at timestamptz,deleted_at timestamptz,post_kind text default 'pixel_art',submission_puzzle_mode text);
create table public.post_map_points(post_id uuid primary key,public_image_path text,published_at timestamptz,map_space text default 'globe',post_kind text default 'pixel_art',puzzle_mode text);
create table public.sns_guest_claims(guest_id uuid,owner_id uuid,created_at timestamptz);
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
\ir ../../supabase/migrations/20261112023120_home_artwork_consent.sql
insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into user_posts values('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',null,'作品','作者','11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.png',100,repeat('a',64),'image/png','published',now(),null,'pixel_art',null);
insert into post_map_points(post_id,public_image_path,published_at) select id,id::text || '/44444444-4444-4444-8444-444444444444.png',now() from user_posts;
insert into home_artwork_reviews(post_id,approved,still_image,image_path,image_bytes,image_sha256,title,author_name) select p.id,true,true,m.public_image_path,p.image_bytes,p.content_hash,p.title,p.author_name from user_posts p join post_map_points m on m.post_id=p.id;
do $$ begin
  begin
    insert into home_artwork_preferences(owner_id,enabled,consent_version,accepted_at) values('11111111-1111-4111-8111-111111111111',true,null,now());
    raise exception 'NULL consent version accepted';
  exception when check_violation then null; end;
  if (select provolatile from pg_proc where oid='public.pixieed_home_artworks()'::regprocedure) <> 'v' then raise exception 'random reader must be volatile'; end if;
  if has_table_privilege('anon','public.home_artwork_preferences','select') or has_table_privilege('authenticated','public.home_artwork_preferences','update') or has_table_privilege('authenticated','public.home_artwork_reviews','insert') or has_function_privilege('anon','public.pixieed_home_artworks()','execute') or has_function_privilege('authenticated','public.pixieed_home_artwork_preference(uuid,boolean,bigint)','execute') then raise exception 'exposed private access'; end if;
  if exists(select 1 from pg_class where oid in ('home_artwork_preferences'::regclass,'home_artwork_reviews'::regclass) and not relrowsecurity) then raise exception 'RLS disabled'; end if;
end $$;
set local role service_role;
do $$ declare owner uuid := '11111111-1111-4111-8111-111111111111'; v jsonb; begin
  if pixieed_home_artworks()<>'[]'::jsonb then raise exception 'default opt-in'; end if;
  v:=pixieed_home_artwork_preference(owner,true,0);
  if jsonb_array_length(pixieed_home_artworks())<>1 then raise exception 'missing eligible post'; end if;
  begin perform pixieed_home_artwork_preference(owner,false,0); raise exception 'stale revision accepted'; exception when raise_exception then if sqlerrm <> 'preference_conflict' then raise; end if; end;
  perform pixieed_home_artwork_preference(owner,false,1);
  if pixieed_home_artworks()<>'[]'::jsonb then raise exception 'withdrawal ignored'; end if;
  perform pixieed_home_artwork_preference(owner,true,2);
  update home_artwork_reviews set approved=false;
  if pixieed_home_artworks()<>'[]'::jsonb then raise exception 'unreviewed visible'; end if;
  update home_artwork_reviews set approved=true,still_image=false;
  if pixieed_home_artworks()<>'[]'::jsonb then raise exception 'animation visible'; end if;
  update home_artwork_reviews set still_image=true;
  update user_posts set title='変更';
  if pixieed_home_artworks()<>'[]'::jsonb then raise exception 'changed title visible'; end if;
  update user_posts set title='作品',author_name='変更';
  if pixieed_home_artworks()<>'[]'::jsonb then raise exception 'changed author visible'; end if;
  update user_posts set author_name='作者',deleted_at=now();
  if pixieed_home_artworks()<>'[]'::jsonb then raise exception 'deleted visible'; end if;
  update user_posts set deleted_at=null,status='pending';
  if pixieed_home_artworks()<>'[]'::jsonb then raise exception 'pending visible'; end if;
  update user_posts set status='published';
  update post_map_points set public_image_path='wrong.png';
  if pixieed_home_artworks()<>'[]'::jsonb then raise exception 'wrong path visible'; end if;
  update post_map_points set public_image_path=(select image_path from home_artwork_reviews);
  update user_posts set content_hash=repeat('b',64);
  if pixieed_home_artworks()<>'[]'::jsonb then raise exception 'wrong hash visible'; end if;
  update user_posts set content_hash=repeat('a',64);
  -- Transfer does not copy the original owner's consent. Imported artwork requires
  -- a fresh acceptance by the receiving owner after the claim timestamp.
  insert into sns_guest_claims values(owner,'22222222-2222-4222-8222-222222222222',clock_timestamp());
  update user_posts set media_author_id=author_id,author_id='22222222-2222-4222-8222-222222222222';
  if pixieed_home_artworks()<>'[]'::jsonb then raise exception 'claim copied consent'; end if;
  perform pixieed_home_artwork_preference('22222222-2222-4222-8222-222222222222',true,0);
  if jsonb_array_length(pixieed_home_artworks())<>1 then raise exception 'fresh claim consent missing'; end if;
end $$;
-- Every eligible item participates, including rows older than the latest 24.
insert into user_posts(id,author_id,title,author_name,image_path,image_bytes,content_hash,image_mime,status,published_at,post_kind)
select ('55555555-5555-4555-8555-' || lpad(n::text,12,'0'))::uuid,'22222222-2222-4222-8222-222222222222','作品','作者','private-unused',100,md5(n::text)||md5(n::text),'image/png','published',now()-n*interval '1 day','pixel_art' from generate_series(1,60) n;
insert into post_map_points(post_id,public_image_path,published_at) select id,id::text||'/44444444-4444-4444-8444-444444444444.png',published_at from user_posts where image_path='private-unused';
insert into home_artwork_reviews(post_id,approved,still_image,image_path,image_bytes,image_sha256,title,author_name)
select p.id,true,true,m.public_image_path,p.image_bytes,p.content_hash,p.title,p.author_name from user_posts p join post_map_points m on m.post_id=p.id where p.image_path='private-unused';
do $$ declare result jsonb; seen text[] := '{}'; item jsonb; begin
  for attempt in 1..50 loop
    result:=pixieed_home_artworks();
    if jsonb_array_length(result)<>24 then raise exception 'candidate limit not enforced'; end if;
    for item in select value from jsonb_array_elements(result) loop
      if not (item->>'id'=any(seen)) then seen:=array_append(seen,item->>'id'); end if;
    end loop;
  end loop;
  -- This catches the old deterministic LIMIT 24; failure probability under random sampling is negligible.
  if cardinality(seen)<=24 then raise exception 'eligible population is permanently excluded'; end if;
end $$;
rollback;
