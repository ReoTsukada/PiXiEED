-- Isolated PostgreSQL acceptance fixtures only. The caller owns a disposable DB.
begin;

insert into auth.users(id) values
  ('00000000-0000-4000-8000-00000000a001'),
  ('00000000-0000-4000-8000-00000000a002');

insert into public.user_posts(
  id,author_id,title,caption,image_path,image_mime,image_bytes,image_width,image_height,
  color_count,content_hash,status,published_at
) values
  ('00000000-0000-4000-8000-00000000b001','00000000-0000-4000-8000-00000000a001','Owner post','',
   '00000000-0000-4000-8000-00000000a001/00000000-0000-4000-8000-00000000b001.png',
   'image/png',120,16,16,2,repeat('a',64),'published',now()),
  ('00000000-0000-4000-8000-00000000b011','00000000-0000-4000-8000-00000000a001','Puzzle post','',
   '00000000-0000-4000-8000-00000000a001/00000000-0000-4000-8000-00000000b011.png',
   'image/png',120,16,16,2,repeat('b',64),'published',now()),
  ('00000000-0000-4000-8000-00000000b002','00000000-0000-4000-8000-00000000a002','Other owner post','',
   '00000000-0000-4000-8000-00000000a002/00000000-0000-4000-8000-00000000b002.png',
   'image/png',120,16,16,2,repeat('d',64),'pending',null);

insert into public.post_map_points(
  post_id,map_space,projection_version,cell_grid,cell_x,cell_y,prefecture_code,
  title,caption,public_image_path,published_at,post_kind,puzzle_mode
) values
  ('00000000-0000-4000-8000-00000000b001','japan','japan-cell-v1',64,3,4,'13','Owner post','',
   '00000000-0000-4000-8000-00000000b001/00000000-0000-4000-8000-00000000d001.png',now(),'pixel_art',null),
  ('00000000-0000-4000-8000-00000000b011','japan','japan-cell-v1',64,3,4,'13','Puzzle post','',
   '00000000-0000-4000-8000-00000000b011/00000000-0000-4000-8000-00000000d011.png',now(),'pixel_art','spot_difference');

insert into public.user_post_puzzles(
  post_id,mode,schema_version,source_metadata,definition,definition_hash,review_state,
  changed_image_path,changed_image_claim
) values (
  '00000000-0000-4000-8000-00000000b011','spot_difference',1,
  '{"schemaVersion":1,"original":{"draftId":"d","assetId":"a","revisionId":"r1","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","hashScheme":"sha256-canonical-v1"},"changed":{"draftId":"d","assetId":"a","revisionId":"r2","contentHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","hashScheme":"sha256-canonical-v1"}}',
  '{"schemaVersion":1,"width":16,"height":16,"confirmed":true,"candidates":[{"id":"spot","pixels":[1]}]}',
  repeat('c',64),'approved',
  '00000000-0000-4000-8000-00000000b011/00000000-0000-4000-8000-00000000d012.png',
  '{"mimeType":"image/png","size":120,"width":16,"height":16,"colorCount":2}'
);

insert into storage.objects(bucket_id,name) values
  ('post-quarantine','00000000-0000-4000-8000-00000000a001/00000000-0000-4000-8000-00000000b001.png'),
  ('post-quarantine','00000000-0000-4000-8000-00000000a001/00000000-0000-4000-8000-00000000b011.png'),
  ('post-public','00000000-0000-4000-8000-00000000b001/00000000-0000-4000-8000-00000000d001.png'),
  ('post-public','00000000-0000-4000-8000-00000000b011/00000000-0000-4000-8000-00000000d011.png'),
  ('post-public','00000000-0000-4000-8000-00000000b011/00000000-0000-4000-8000-00000000d012.png');

set local role service_role;
do $$
declare
  v_result jsonb;
begin
  if has_function_privilege('anon','public.pixieed_apply_new_post_author_name()','execute')
    or has_function_privilege('authenticated','public.pixieed_apply_new_post_author_name()','execute')
    or has_function_privilege('anon','public.pixieed_copy_post_author_name_to_point()','execute')
    or has_function_privilege('authenticated','public.pixieed_copy_post_author_name_to_point()','execute')
    or not has_function_privilege('service_role','public.pixieed_apply_new_post_author_name()','execute')
    or not has_function_privilege('service_role','public.pixieed_copy_post_author_name_to_point()','execute') then
    raise exception 'author-name trigger function grants are unsafe';
  end if;
  if has_function_privilege('anon','public.pixieed_set_post_author_name(uuid,text)','execute')
    or has_function_privilege('authenticated','public.pixieed_set_post_author_name(uuid,text)','execute')
    or not has_function_privilege('service_role','public.pixieed_set_post_author_name(uuid,text)','execute') then
    raise exception 'author-name RPC is not service-role-only';
  end if;
  if has_table_privilege('authenticated','public.post_author_profiles','insert')
    or has_table_privilege('authenticated','public.post_author_profiles','update')
    or has_table_privilege('authenticated','public.post_author_profiles','delete')
    or not has_table_privilege('authenticated','public.post_author_profiles','select')
    or has_table_privilege('anon','public.post_author_profiles','select') then
    raise exception 'author profile grants do not match private owner-read policy';
  end if;

  begin
    perform public.pixieed_set_post_author_name('00000000-0000-4000-8000-00000000a001',repeat('x',41));
    raise exception '41-codepoint display name unexpectedly passed';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.pixieed_set_post_author_name('00000000-0000-4000-8000-00000000a001',E'bad\nname');
    raise exception 'control character unexpectedly passed';
  exception when sqlstate '22023' then null;
  end;

  v_result := public.pixieed_set_post_author_name('00000000-0000-4000-8000-00000000a001','玲奈');
  if v_result->>'ok' <> 'true' or v_result->>'name' <> '玲奈'
    or (select count(*) from public.user_posts where author_id='00000000-0000-4000-8000-00000000a001' and deleted_at is null and author_name='玲奈') <> 2
    or (select count(*) from public.post_map_points point join public.user_posts post on post.id=point.post_id
        where post.author_id='00000000-0000-4000-8000-00000000a001' and point.author_name='玲奈') <> 2 then
    raise exception 'profile save did not backfill the owner active posts and points';
  end if;
  if (select author_name from public.user_posts where id='00000000-0000-4000-8000-00000000b002') <> '' then
    raise exception 'author name leaked to another owner post';
  end if;
  perform public.pixieed_set_post_author_name('00000000-0000-4000-8000-00000000a002','Other');

  insert into public.user_posts(
    id,author_id,title,caption,image_path,image_mime,image_bytes,image_width,image_height,
    color_count,content_hash,status
  ) values (
    '00000000-0000-4000-8000-00000000b021','00000000-0000-4000-8000-00000000a001','Later post','',
    '00000000-0000-4000-8000-00000000a001/00000000-0000-4000-8000-00000000b021.png',
    'image/png',120,16,16,2,repeat('e',64),'pending'
  );
  if (select author_name from public.user_posts where id='00000000-0000-4000-8000-00000000b021') <> '玲奈' then
    raise exception 'new post did not inherit the saved profile name';
  end if;
  insert into public.post_map_points(
    post_id,map_space,projection_version,cell_grid,cell_x,cell_y,prefecture_code,
    title,caption,public_image_path,published_at,post_kind,author_name
  ) values (
    '00000000-0000-4000-8000-00000000b021','japan','japan-cell-v1',64,3,4,'13','Later post','',
    '00000000-0000-4000-8000-00000000b021/00000000-0000-4000-8000-00000000d021.png',now(),'pixel_art','spoofed'
  );
  if (select author_name from public.post_map_points where post_id='00000000-0000-4000-8000-00000000b021') <> '玲奈' then
    raise exception 'new point did not copy its owner post name';
  end if;
end $$;
reset role;

do $$
begin
  if has_function_privilege('anon','public.pixieed_delete_own_post(uuid,uuid)','execute')
    or has_function_privilege('authenticated','public.pixieed_delete_own_post(uuid,uuid)','execute')
    or not has_function_privilege('service_role','public.pixieed_delete_own_post(uuid,uuid)','execute') then
    raise exception 'delete RPC privileges are not service-role-only';
  end if;
  if has_function_privilege('anon','public.pixieed_complete_own_post_delete(uuid,uuid)','execute')
    or has_function_privilege('authenticated','public.pixieed_complete_own_post_delete(uuid,uuid)','execute')
    or not has_function_privilege('service_role','public.pixieed_complete_own_post_delete(uuid,uuid)','execute') then
    raise exception 'delete-completion RPC privileges are not service-role-only';
  end if;
  if not exists(select 1 from pg_attribute where attrelid='public.post_map_points'::regclass and attname='published_at' and not attnotnull) then
    raise exception 'public point timestamp cannot be nulled for removal';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a001',true);
do $$
begin
  if (select count(*) from public.post_author_profiles) <> 1 then
    raise exception 'owner can read another author profile';
  end if;
  if (select count(*) from storage.objects where bucket_id='post-quarantine') <> 2 then
    raise exception 'owner could not read exactly their quarantine originals';
  end if;
end $$;
reset role;

set local role service_role;
do $$
declare
  v_result jsonb;
begin
  begin
    perform public.pixieed_delete_own_post(
      '00000000-0000-4000-8000-00000000b001','00000000-0000-4000-8000-00000000a002'
    );
    raise exception 'cross-owner deletion unexpectedly succeeded';
  exception when sqlstate 'P0002' then null;
  end;
  if (select status from public.user_posts where id='00000000-0000-4000-8000-00000000b001') <> 'published' then
    raise exception 'cross-owner attempt changed the post';
  end if;

  v_result := public.pixieed_delete_own_post(
    '00000000-0000-4000-8000-00000000b001','00000000-0000-4000-8000-00000000a001'
  );
  if v_result->>'deleted' <> 'true' or jsonb_array_length(v_result->'storage') <> 2
    or not exists(select 1 from jsonb_array_elements(v_result->'storage') asset
      where asset->>'bucket'='post-quarantine' and asset->>'path'='00000000-0000-4000-8000-00000000a001/00000000-0000-4000-8000-00000000b001.png')
    or not exists(select 1 from jsonb_array_elements(v_result->'storage') asset
      where asset->>'bucket'='post-public' and asset->>'path'='00000000-0000-4000-8000-00000000b001/00000000-0000-4000-8000-00000000d001.png') then
    raise exception 'ordinary post returned incomplete cleanup paths';
  end if;
  if (select status from public.user_posts where id='00000000-0000-4000-8000-00000000b001') <> 'hidden'
    or (select deleted_at from public.user_posts where id='00000000-0000-4000-8000-00000000b001') is null
    or (select published_at from public.user_posts where id='00000000-0000-4000-8000-00000000b001') is not null
    or (select published_at from public.post_map_points where post_id='00000000-0000-4000-8000-00000000b001') is not null then
    raise exception 'ordinary post tombstone did not hide publication';
  end if;

  v_result := public.pixieed_delete_own_post(
    '00000000-0000-4000-8000-00000000b001','00000000-0000-4000-8000-00000000a001'
  );
  if jsonb_array_length(v_result->'storage') <> 2 then
    raise exception 'retry lost cleanup paths after a partial storage failure';
  end if;

  v_result := public.pixieed_delete_own_post(
    '00000000-0000-4000-8000-00000000b011','00000000-0000-4000-8000-00000000a001'
  );
  if jsonb_array_length(v_result->'storage') <> 3
    or not exists(select 1 from jsonb_array_elements(v_result->'storage') asset
      where asset->>'bucket'='post-public' and asset->>'path'='00000000-0000-4000-8000-00000000b011/00000000-0000-4000-8000-00000000d012.png') then
    raise exception 'approved puzzle cleanup paths are incomplete';
  end if;
  if public.pixieed_read_public_puzzle('00000000-0000-4000-8000-00000000b011') is not null then
    raise exception 'deleted puzzle remains available through public reader';
  end if;
end $$;
reset role;

set local role anon;
do $$
begin
  if (select count(*) from public.post_map_points where post_id in (
      '00000000-0000-4000-8000-00000000b001','00000000-0000-4000-8000-00000000b011'
    )) <> 0 then
    raise exception 'tombstoned map points remain public';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a001',true);
do $$
begin
  if (select count(*) from public.user_posts where id in (
      '00000000-0000-4000-8000-00000000b001','00000000-0000-4000-8000-00000000b011'
    )) <> 2 then
    raise exception 'owner cannot see tombstones while storage cleanup is pending';
  end if;
  if exists(select 1 from storage.objects where bucket_id='post-quarantine'
      and name='00000000-0000-4000-8000-00000000a001/00000000-0000-4000-8000-00000000b001.png') then
    raise exception 'owner can still read private source image while cleanup is pending';
  end if;
end $$;
reset role;

set local role service_role;
do $$
declare
  v_result jsonb;
begin
  v_result := public.pixieed_complete_own_post_delete(
    '00000000-0000-4000-8000-00000000b001','00000000-0000-4000-8000-00000000a001'
  );
  if v_result->>'cleanupCompleted' <> 'true' then raise exception 'cleanup was not completed'; end if;
  v_result := public.pixieed_complete_own_post_delete(
    '00000000-0000-4000-8000-00000000b011','00000000-0000-4000-8000-00000000a001'
  );
  if v_result->>'cleanupCompleted' <> 'true' then raise exception 'puzzle cleanup was not completed'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a001',true);
do $$
begin
  if exists(select 1 from public.user_posts where id in (
      '00000000-0000-4000-8000-00000000b001','00000000-0000-4000-8000-00000000b011'
    )) then
    raise exception 'fully cleaned tombstone remains in owner listing';
  end if;
end $$;

rollback;
