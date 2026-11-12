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
insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'),('77777777-7777-4777-8777-777777777777');
insert into user_posts values('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',null,'作品','作者','11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.png',100,repeat('a',64),'image/png','published',now(),null,'pixel_art',null);
insert into post_map_points(post_id,public_image_path,published_at) select id,id::text || '/44444444-4444-4444-8444-444444444444.png',now() from user_posts;
alter default privileges in schema public grant all on tables to service_role;
\ir ../../supabase/migrations/20261112023144_home_artwork_review_admin.sql
do $$ declare name text; begin
  foreach name in array array['public.pixieed_home_review_candidates()','public.pixieed_home_review_list(text,uuid,integer)','public.pixieed_home_review_item(uuid)','public.pixieed_home_review_save(uuid,text,text,uuid)'] loop
    if has_function_privilege('anon',name,'execute') or has_function_privilege('authenticated',name,'execute') then raise exception 'public management RPC'; end if;
  end loop;
  if has_table_privilege('authenticated','home_artwork_review_events','select') or has_table_privilege('anon','home_artwork_review_events','insert') then raise exception 'public audit'; end if;
  if has_table_privilege('service_role','home_artwork_review_events','update') or has_table_privilege('service_role','home_artwork_review_events','delete') then raise exception 'audit not append-only'; end if;
  if not (select relrowsecurity from pg_class where oid='home_artwork_review_events'::regclass) then raise exception 'audit RLS disabled'; end if;
end $$;
set local role service_role;
do $$ declare owner uuid:='11111111-1111-4111-8111-111111111111'; post uuid:='33333333-3333-4333-8333-333333333333'; token text; v jsonb; begin
  if jsonb_array_length(pixieed_home_review_list()->'artworks')<>0 then raise exception 'optout listed'; end if;
  perform pixieed_home_artwork_preference(owner,true,0);
  v:=pixieed_home_review_list(); token:=v->'artworks'->0->>'snapshotToken';
  if v->'artworks'->0->>'reviewState'<>'pending' or token is null then raise exception 'pending absent'; end if;
  if position(owner::text in v::text)>0 or v::text like '%reviewer_note%' or v::text like '%author_id%' then raise exception 'private data leaked'; end if;
  update user_posts set author_name='' where id=post;
  begin perform pixieed_home_review_save(post,'approve',pixieed_home_review_item(post)->>'snapshotToken',owner); raise exception 'empty author accepted'; exception when raise_exception then if sqlerrm<>'public_display_name_required' then raise; end if; end;
  update user_posts set author_name='作者' where id=post;
  perform pixieed_home_review_save(post,'approve',token,owner);
  if jsonb_array_length(pixieed_home_artworks())<>1 then raise exception 'approval not published'; end if;
  begin perform pixieed_home_review_save(post,'approve',token,owner); raise exception 'duplicate accepted'; exception when raise_exception then if sqlerrm<>'review_conflict' then raise; end if; end;
  token:=pixieed_home_review_item(post)->>'snapshotToken';
  perform pixieed_home_review_save(post,'hold',token,owner);
  if jsonb_array_length(pixieed_home_artworks())<>0 or pixieed_home_review_item(post)->>'reviewState'<>'held' then raise exception 'hold ineffective'; end if;
  token:=pixieed_home_review_item(post)->>'snapshotToken'; update user_posts set title='changed' where id=post;
  begin perform pixieed_home_review_save(post,'approve',token,owner); raise exception 'changed title accepted'; exception when raise_exception then if sqlerrm<>'review_conflict' then raise; end if; end;
  if pixieed_home_review_item(post)->>'reviewState'<>'pending' then raise exception 'changed needs review'; end if;
  token:=pixieed_home_review_item(post)->>'snapshotToken'; update user_posts set author_name='changed' where id=post;
  begin perform pixieed_home_review_save(post,'approve',token,owner); raise exception 'changed author accepted'; exception when raise_exception then if sqlerrm<>'review_conflict' then raise; end if; end;
  token:=pixieed_home_review_item(post)->>'snapshotToken'; update user_posts set content_hash=repeat('b',64) where id=post;
  begin perform pixieed_home_review_save(post,'approve',token,owner); raise exception 'changed hash accepted'; exception when raise_exception then if sqlerrm<>'review_conflict' then raise; end if; end;
  token:=pixieed_home_review_item(post)->>'snapshotToken'; update post_map_points set public_image_path=post::text||'/55555555-5555-4555-8555-555555555555.png' where post_id=post;
  begin perform pixieed_home_review_save(post,'approve',token,owner); raise exception 'changed path accepted'; exception when raise_exception then if sqlerrm<>'review_conflict' then raise; end if; end;
  token:=pixieed_home_review_item(post)->>'snapshotToken'; perform pixieed_home_artwork_preference(owner,false,1);
  begin perform pixieed_home_review_save(post,'approve',token,owner); raise exception 'withdrawal ignored'; exception when raise_exception then if sqlerrm<>'review_conflict' then raise; end if; end;
  perform pixieed_home_artwork_preference(owner,true,2);
  token:=pixieed_home_review_item(post)->>'snapshotToken'; update user_posts set deleted_at=now() where id=post;
  begin perform pixieed_home_review_save(post,'approve',token,owner); raise exception 'deleted accepted'; exception when raise_exception then if sqlerrm<>'review_conflict' then raise; end if; end;
  update user_posts set deleted_at=null where id=post;
  token:=pixieed_home_review_item(post)->>'snapshotToken';
  insert into sns_guest_claims values(owner,'22222222-2222-4222-8222-222222222222',clock_timestamp());
  update user_posts set media_author_id=author_id,author_id='22222222-2222-4222-8222-222222222222' where id=post;
  begin perform pixieed_home_review_save(post,'approve',token,owner); raise exception 'claim accepted'; exception when raise_exception then if sqlerrm<>'review_conflict' then raise; end if; end;
  if (select count(*) from home_artwork_review_events)<>2 then raise exception 'unexpected audit events'; end if;
  if exists(select 1 from home_artwork_review_events where reviewer_id is distinct from owner or created_at is null) then raise exception 'audit identity missing'; end if;
end $$;
-- Keyset pagination traverses all eligible rows once, independent of timestamps.
select pixieed_home_artwork_preference('22222222-2222-4222-8222-222222222222',true,0);
do $$ declare owner uuid:='22222222-2222-4222-8222-222222222222'; post uuid:='33333333-3333-4333-8333-333333333333'; token text; old_path text; old_title text; v jsonb; begin
  perform pixieed_home_review_save(post,'approve',pixieed_home_review_item(post)->>'snapshotToken',owner);
  perform pixieed_home_artwork_preference(owner,false,1);
  v:=pixieed_home_review_item(post); token:=v->>'snapshotToken';
  if v->>'eligible'<>'false' or v ?| array['imagePath','imageBytes','imageSha256','publishedAt'] then raise exception 'ineligible image exposed'; end if;
  begin perform pixieed_home_review_save(post,'approve',token,owner); raise exception 'ineligible approval accepted'; exception when raise_exception then if sqlerrm<>'review_conflict' then raise; end if; end;
  select image_path,title into old_path,old_title from home_artwork_reviews where post_id=post;
  perform pixieed_home_review_save(post,'hold',token,owner);
  begin perform pixieed_home_review_save(post,'hold',token,owner); raise exception 'stale second admin accepted'; exception when raise_exception then if sqlerrm<>'review_conflict' then raise; end if; end;
  if exists(select 1 from home_artwork_reviews where post_id=post and (image_path<>old_path or title<>old_title)) then raise exception 'ineligible hold rewrote metadata'; end if;
  perform pixieed_home_artwork_preference(owner,true,2);
  if jsonb_array_length(pixieed_home_artworks())<>0 then raise exception 'OFF hold ON resurrected'; end if;
  perform pixieed_home_review_save(post,'approve',pixieed_home_review_item(post)->>'snapshotToken',owner);
  update user_posts set deleted_at=now() where id=post;
  perform pixieed_home_review_save(post,'hold',pixieed_home_review_item(post)->>'snapshotToken',owner);
  update user_posts set deleted_at=null where id=post;
  if jsonb_array_length(pixieed_home_artworks())<>0 then raise exception 'deleted hold resurrected'; end if;
  perform pixieed_home_review_save(post,'approve',pixieed_home_review_item(post)->>'snapshotToken',owner);
  update user_posts set title='new unpublished title',status='hidden' where id=post;
  v:=pixieed_home_review_item(post);
  if v->>'title'<>old_title or v ? 'imagePath' then raise exception 'nonpublic metadata exposed'; end if;
  perform pixieed_home_review_save(post,'hold',v->>'snapshotToken',owner);
  if exists(select 1 from home_artwork_reviews where post_id=post and title<>old_title) then raise exception 'hold overwrote old title'; end if;
  update user_posts set status='published' where id=post;
  perform pixieed_home_review_save(post,'approve',pixieed_home_review_item(post)->>'snapshotToken',owner);
  insert into sns_guest_claims values(owner,'77777777-7777-4777-8777-777777777777',clock_timestamp());
  update user_posts set author_id='77777777-7777-4777-8777-777777777777' where id=post;
  v:=pixieed_home_review_item(post);
  if v->>'eligible'<>'false' or v ? 'imagePath' then raise exception 'claim target exposed'; end if;
  perform pixieed_home_review_save(post,'hold',v->>'snapshotToken',owner);
  if (select approved from home_artwork_reviews where post_id=post) then raise exception 'claim hold failed'; end if;
end $$;
select pixieed_home_artwork_preference('77777777-7777-4777-8777-777777777777',true,0);
insert into user_posts(id,author_id,title,author_name,image_path,image_bytes,content_hash,image_mime,status,published_at,post_kind)
select ('55555555-5555-4555-8555-' || lpad(n::text,12,'0'))::uuid,'77777777-7777-4777-8777-777777777777','作品','作者','private-unused',100,md5(n::text)||md5(n::text),'image/png','published',now(),'pixel_art' from generate_series(1,60) n;
insert into post_map_points(post_id,public_image_path,published_at) select id,id::text||'/44444444-4444-4444-8444-444444444444.png',published_at from user_posts where image_path='private-unused';
do $$ declare v jsonb; cursor uuid; seen text[]:='{}'; item jsonb; begin
  loop
    v:=pixieed_home_review_list('all',cursor,24);
    if jsonb_array_length(v->'artworks')>24 then raise exception 'page overflow'; end if;
    for item in select value from jsonb_array_elements(v->'artworks') loop
      if item->>'postId'=any(seen) then raise exception 'duplicate page'; end if;
      seen:=array_append(seen,item->>'postId');
    end loop;
    cursor:=(v->>'nextCursor')::uuid; exit when cursor is null;
  end loop;
  if cardinality(seen)<>61 then raise exception 'missing page'; end if;
  if jsonb_array_length(pixieed_home_review_list('approved')->'artworks')<>0 then raise exception 'stale approval listed'; end if;
end $$;
rollback;
