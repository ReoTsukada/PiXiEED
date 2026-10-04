-- Isolated PostgreSQL acceptance fixtures only. The caller owns a disposable DB.
begin;

insert into auth.users (id) values
  ('00000000-0000-4000-8000-00000000a001'),
  ('00000000-0000-4000-8000-00000000a002');

do $$
declare
  hidden_definition jsonb := '{"schemaVersion":1,"width":16,"height":16,"confirmed":true,"targets":[{"id":"flower","name":"花","pixels":[85]}],"hitBoxes":[{"targetId":"flower","minX":5,"minY":5,"maxX":10,"maxY":10}]}'::jsonb;
begin
  if public.pixieed_valid_puzzle_source('hidden_object', 'null'::jsonb) is distinct from false
    or public.pixieed_valid_puzzle_source('hidden_object', '{"original":{}}'::jsonb) is distinct from false
    or public.pixieed_valid_puzzle_source('hidden_object', '{"schemaVersion":null,"original":{}}'::jsonb) is distinct from false
    or public.pixieed_valid_puzzle_definition('spot_difference', 'null'::jsonb) is distinct from false
    or public.pixieed_valid_puzzle_definition('spot_difference', '{"schemaVersion":2}'::jsonb) is distinct from false
    or public.pixieed_valid_image_claim('null'::jsonb) is distinct from false then
    raise exception 'null or unsupported puzzle metadata passed database validation';
  end if;
  if has_table_privilege('anon', 'public.user_post_puzzles', 'select')
    or has_table_privilege('authenticated', 'public.user_post_puzzles', 'select')
    or has_function_privilege('anon', 'public.pixieed_create_post(jsonb,jsonb,jsonb)', 'execute')
    or has_function_privilege('authenticated', 'public.pixieed_moderate_post(uuid,text,text,jsonb,text)', 'execute') then
    raise exception 'untrusted role has direct puzzle table or RPC access';
  end if;
  if not has_function_privilege('service_role', 'public.pixieed_create_post(jsonb,jsonb,jsonb)', 'execute')
    or not has_function_privilege('service_role', 'public.pixieed_read_public_puzzle(uuid)', 'execute') then
    raise exception 'service role is missing puzzle RPC access';
  end if;
  if not public.pixieed_valid_puzzle_definition('hidden_object', hidden_definition)
    or not public.pixieed_valid_puzzle_definition('hidden_object', hidden_definition || jsonb_build_object('prompt', E'花を探して\nね'))
    or public.pixieed_valid_puzzle_definition('hidden_object', hidden_definition || jsonb_build_object('unexpected', 'value'))
    or public.pixieed_valid_puzzle_definition('hidden_object', hidden_definition || jsonb_build_object('prompt', repeat('x', 181)))
    or public.pixieed_valid_puzzle_definition('hidden_object', hidden_definition || jsonb_build_object('prompt', E'bad\rcontrol')) then
    raise exception 'optional hidden-object prompt does not match the client validation contract';
  end if;
  if public.pixieed_valid_image_claim('{"mimeType":"image/png","size":120,"width":16,"height":16,"colorCount":129}'::jsonb) then
    raise exception '129-colour image claim passed database validation';
  end if;
end;
$$;

create function public.test_puzzle_publication_fail_parent()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'published' and new.status = 'published' then
    raise exception 'injected transaction rollback check' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger test_puzzle_publication_fail_parent
before update of status on public.user_posts
for each row execute function public.test_puzzle_publication_fail_parent();

set local role service_role;
do $$
declare
  v_author uuid := '00000000-0000-4000-8000-00000000a001';
  v_other_author uuid := '00000000-0000-4000-8000-00000000a002';
  v_post_id uuid := '00000000-0000-4000-8000-00000000b001';
  v_retry_id uuid := '00000000-0000-4000-8000-00000000b011';
  v_other_post_id uuid := '00000000-0000-4000-8000-00000000b002';
  v_hidden_id uuid := '00000000-0000-4000-8000-00000000b003';
  v_rollback_id uuid := '00000000-0000-4000-8000-00000000b004';
  v_one_pixel_id uuid := '00000000-0000-4000-8000-00000000b005';
  v_oversize_id uuid := '00000000-0000-4000-8000-00000000b006';
  v_key uuid := '00000000-0000-4000-8000-00000000c001';
  v_digest text := repeat('a', 64);
  v_claim jsonb := '{"mimeType":"image/png","size":120,"width":16,"height":16,"colorCount":2}'::jsonb;
  v_source jsonb := '{"schemaVersion":1,"original":{"draftId":"id-1","assetId":"asset-1","revisionId":"revision-1","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","hashScheme":"sha256-canonical-v1"},"changed":{"draftId":"id-1","assetId":"asset-1","revisionId":"revision-2","contentHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","hashScheme":"sha256-canonical-v1"}}'::jsonb;
  v_hidden_source jsonb := '{"schemaVersion":1,"original":{"draftId":"id-1","assetId":"asset-1","revisionId":"revision-1","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","hashScheme":"sha256-canonical-v1"}}'::jsonb;
  v_spot_definition jsonb := '{"schemaVersion":1,"width":16,"height":16,"confirmed":true,"candidates":[{"id":"spot-1","pixels":[1]}]}'::jsonb;
  v_hidden_definition jsonb := '{"schemaVersion":1,"width":16,"height":16,"confirmed":true,"targets":[{"id":"target-1","name":"花","pixels":[85]}],"hitBoxes":[{"targetId":"target-1","minX":5,"minY":5,"maxX":10,"maxY":10}]}'::jsonb;
  v_location jsonb;
  v_post jsonb;
  v_puzzle jsonb;
  v_result jsonb;
  v_point jsonb;
  v_published_path text := '00000000-0000-4000-8000-00000000b001/00000000-0000-4000-8000-00000000d001.png';
  v_changed_path text := '00000000-0000-4000-8000-00000000b001/00000000-0000-4000-8000-00000000d002.png';
  v_reader jsonb;
begin
  v_location := jsonb_build_object(
    'source','map-cell','map_space','globe','cell_grid',null,'cell_x',null,'cell_y',null,'prefecture_code',null,
    'projection_version','v11-meridian-parallel-quarter-degree',
    'globe_cell_id','globe:v11-meridian-parallel-quarter-degree:360:720','globe_band',360,'globe_column',720
  );
  v_post := jsonb_build_object(
    'id',v_post_id,'author_id',v_author,'title','Spot fixture','caption','DB contract','post_kind','pixel_art',
    'image_path',v_author::text || '/' || v_post_id::text || '.png','image_mime','image/png','image_bytes',120,
    'image_width',16,'image_height',16,'color_count',2,'content_hash',repeat('c',64),'status','pending',
    'request_key',v_key,'request_digest',v_digest
  );
  v_puzzle := jsonb_build_object(
    'mode','spot_difference','schema_version',1,'source_metadata',v_source,'definition',v_spot_definition,
    'definition_hash',repeat('d',64),'changed_image_path',v_author::text || '/' || v_post_id::text || '-changed.png',
    'changed_image_claim',v_claim
  );
  v_result := public.pixieed_create_post(v_post,v_location,v_puzzle);
  if v_result->>'postId' <> v_post_id::text or v_result->>'status' <> 'pending' or v_result->>'replayed' <> 'false' then
    raise exception 'first puzzle submission did not return a pending non-replay';
  end if;
  if public.pixieed_read_public_puzzle(v_post_id) is not null then
    raise exception 'pending puzzle escaped public reader';
  end if;

  -- Same author/key/digest replays the committed records despite fresh upload paths and IDs.
  v_post := jsonb_set(v_post, '{id}', to_jsonb(v_retry_id::text));
  v_post := jsonb_set(v_post, '{image_path}', to_jsonb(v_author::text || '/' || v_retry_id::text || '.png'));
  v_puzzle := jsonb_set(v_puzzle, '{changed_image_path}', to_jsonb(v_author::text || '/' || v_retry_id::text || '-changed.png'));
  v_result := public.pixieed_create_post(v_post,v_location,v_puzzle);
  if v_result->>'postId' <> v_post_id::text or v_result->>'replayed' <> 'true' then
    raise exception 'same request key did not converge to the first post';
  end if;
  v_result := public.pixieed_lookup_post_request(v_author,v_key,v_digest);
  if v_result->>'postId' <> v_post_id::text or v_result->>'replayed' <> 'true' then
    raise exception 'request lookup did not return the complete submission';
  end if;
  begin
    perform public.pixieed_lookup_post_request(v_author,v_key,repeat('e',64));
    raise exception 'request digest mismatch was accepted';
  exception when unique_violation then null;
  end;

  -- A different author may submit identical PNG bytes/hash independently.
  v_post := jsonb_build_object(
    'id',v_other_post_id,'author_id',v_other_author,'title','Same image by another author','caption','',
    'post_kind','pixel_art','image_path',v_other_author::text || '/' || v_other_post_id::text || '.png',
    'image_mime','image/png','image_bytes',120,'image_width',16,'image_height',16,'color_count',2,
    'content_hash',repeat('c',64),'status','pending','request_key',null,'request_digest',null
  );
  v_result := public.pixieed_create_post(v_post,v_location,null);
  if v_result->>'postId' <> v_other_post_id::text or v_result->>'replayed' <> 'false' then
    raise exception 'another author could not submit an identical content hash';
  end if;

  -- Ordinary new posts allow the 1px minimum and reject either axis above 256px.
  v_post := jsonb_build_object(
    'id',v_one_pixel_id,'author_id',v_author,'title','One pixel','caption','', 'post_kind','pixel_art',
    'image_path',v_author::text || '/' || v_one_pixel_id::text || '.png','image_mime','image/png','image_bytes',120,
    'image_width',1,'image_height',1,'color_count',1,'content_hash',repeat('1',64),'status','pending',
    'request_key',null,'request_digest',null
  );
  v_result := public.pixieed_create_post(v_post,v_location,null);
  if v_result->>'postId' <> v_one_pixel_id::text then raise exception '1x1 ordinary post was rejected'; end if;
  v_post := jsonb_set(v_post,'{id}',to_jsonb(v_oversize_id::text));
  v_post := jsonb_set(v_post,'{image_path}',to_jsonb(v_author::text || '/' || v_oversize_id::text || '.png'));
  v_post := jsonb_set(v_post,'{image_width}','257'::jsonb);
  begin
    perform public.pixieed_create_post(v_post,v_location,null);
    raise exception '257px ordinary post was accepted';
  exception when sqlstate '22023' then null;
  end;
  if exists(select 1 from public.user_posts where id=v_oversize_id) then raise exception 'oversized ordinary post left a parent row'; end if;

  -- A location constraint failure after parent insertion rolls the whole RPC back.
  v_post := jsonb_build_object(
    'id',v_rollback_id,'author_id',v_author,'title','Rollback fixture','caption','',
    'post_kind','pixel_art','image_path',v_author::text || '/' || v_rollback_id::text || '.png',
    'image_mime','image/png','image_bytes',120,'image_width',16,'image_height',16,'color_count',2,
    'content_hash',repeat('f',64),'status','pending','request_key',null,'request_digest',null
  );
  begin
    perform public.pixieed_create_post(v_post,
      jsonb_set(v_location,'{globe_cell_id}','"wrong-cell"'::jsonb),null);
    raise exception 'invalid location was accepted';
  exception when check_violation then null;
  end;
  if exists(select 1 from public.user_posts where id = v_rollback_id)
    or exists(select 1 from public.post_locations_private where post_id = v_rollback_id) then
    raise exception 'failed create transaction left partial rows';
  end if;

  -- A hidden-object source with an unexpected changed reference is rejected.
  begin
    perform public.pixieed_valid_puzzle_source('hidden_object', v_source);
    if public.pixieed_valid_puzzle_source('hidden_object', v_source) then
      raise exception 'hidden-object source accepted a changed reference';
    end if;
  end;

  -- Request-pair NULL is checked by the table constraint, including CHECK UNKNOWN cases.
  begin
    insert into public.user_posts (
      id,author_id,title,caption,post_kind,image_path,image_mime,image_bytes,image_width,image_height,
      color_count,content_hash,status,request_key,request_digest
    ) values (
      '00000000-0000-4000-8000-00000000b099',v_author,'Bad request pair','', 'pixel_art',
      v_author::text || '/bad.png','image/png',120,16,16,2,repeat('9',64),'pending',
      '00000000-0000-4000-8000-00000000c099',null
    );
    raise exception 'non-null key with NULL digest was accepted';
  exception when check_violation then null;
  end;

  -- The source constraint itself rejects malformed source JSON, not only the RPC preflight.
  begin
    insert into public.user_post_puzzles (
      post_id,mode,schema_version,source_metadata,definition,definition_hash,review_state,
      changed_image_path,changed_image_claim
    ) values (
      v_other_post_id,'spot_difference',1,
      '{"schemaVersion":1,"original":null,"changed":{}}'::jsonb,
      v_spot_definition,repeat('d',64),'pending',v_author::text || '/bad.png',v_claim
    );
    raise exception 'malformed source metadata bypassed table constraints';
  exception when check_violation then null;
  end;

  -- Hidden submission and rejection update the parent and puzzle together.
  v_hidden_id := '00000000-0000-4000-8000-00000000b003';
  v_post := jsonb_build_object(
    'id',v_hidden_id,'author_id',v_author,'title','Hidden fixture','caption','', 'post_kind','pixel_art',
    'image_path',v_author::text || '/' || v_hidden_id::text || '.png','image_mime','image/png','image_bytes',120,
    'image_width',16,'image_height',16,'color_count',2,'content_hash',repeat('7',64),'status','pending',
    'request_key',null,'request_digest',null
  );
  v_puzzle := jsonb_build_object(
    'mode','hidden_object','schema_version',1,'source_metadata',v_hidden_source,'definition',v_hidden_definition || jsonb_build_object('prompt', E'花を探して\nね'),
    'definition_hash',repeat('8',64)
  );
  v_result := public.pixieed_create_post(v_post,v_location,v_puzzle);
  if v_result->>'status' <> 'pending' then raise exception 'hidden puzzle was not admitted'; end if;
  v_result := public.pixieed_moderate_post(v_hidden_id,'reject','fixture rejection',null,null);
  if v_result->>'status' <> 'rejected'
    or (select status::text from public.user_posts where id = v_hidden_id) <> 'rejected'
    or (select review_state from public.user_post_puzzles where post_id = v_hidden_id) <> 'rejected' then
    raise exception 'reject did not atomically transition the parent and puzzle';
  end if;
  if public.pixieed_read_public_puzzle(v_hidden_id) is not null then
    raise exception 'rejected hidden puzzle was returned by public reader';
  end if;

  v_point := jsonb_build_object(
    'post_id',v_post_id,'map_space','globe','projection_version','v11-meridian-parallel-quarter-degree',
    'cell_grid',null,'cell_x',null,'cell_y',null,'prefecture_code',null,
    'title','Spot fixture','caption','DB contract','public_image_path',v_published_path,
    'published_at','2026-09-28T00:00:00Z','post_kind','pixel_art',
    'globe_cell_id','globe:v11-meridian-parallel-quarter-degree:360:720','globe_band',360,'globe_column',720,
    'puzzle_mode','spot_difference'
  );
  begin
    perform public.pixieed_moderate_post(v_post_id,'approve','rollback probe',v_point,v_changed_path);
    raise exception 'injected publish failure did not fire';
  exception when check_violation then null;
  end;
  if (select status::text from public.user_posts where id = v_post_id) <> 'pending'
    or (select review_state from public.user_post_puzzles where post_id = v_post_id) <> 'pending'
    or exists(select 1 from public.post_map_points where post_id = v_post_id) then
    raise exception 'failed approval did not roll back parent, point and puzzle writes';
  end if;
end;
$$;

reset role;
drop trigger test_puzzle_publication_fail_parent on public.user_posts;
drop function public.test_puzzle_publication_fail_parent();
set local role service_role;
do $$
declare
  v_post_id uuid := '00000000-0000-4000-8000-00000000b001';
  v_hidden_id uuid := '00000000-0000-4000-8000-00000000b003';
  v_point jsonb;
  v_path text := '00000000-0000-4000-8000-00000000b001/00000000-0000-4000-8000-00000000d001.png';
  v_changed_path text := '00000000-0000-4000-8000-00000000b001/00000000-0000-4000-8000-00000000d002.png';
  v_result jsonb;
  v_reader jsonb;
begin
  v_point := jsonb_build_object(
    'post_id',v_post_id,'map_space','globe','projection_version','v11-meridian-parallel-quarter-degree',
    'cell_grid',null,'cell_x',null,'cell_y',null,'prefecture_code',null,
    'title','Spot fixture','caption','DB contract','public_image_path',v_path,
    'published_at','2026-09-28T00:00:00Z','post_kind','pixel_art',
    'globe_cell_id','globe:v11-meridian-parallel-quarter-degree:360:720','globe_band',360,'globe_column',720,
    'puzzle_mode','spot_difference'
  );
  v_result := public.pixieed_moderate_post(v_post_id,'approve','approved',v_point,v_changed_path);
  if v_result->>'status' <> 'published'
    or (select status::text from public.user_posts where id = v_post_id) <> 'published'
    or (select review_state from public.user_post_puzzles where post_id = v_post_id) <> 'approved'
    or (select puzzle_mode from public.post_map_points where post_id = v_post_id) <> 'spot_difference' then
    raise exception 'approve did not atomically publish parent, map point and puzzle';
  end if;
  v_reader := public.pixieed_read_public_puzzle(v_post_id);
  if v_reader->>'requestedPostId' <> v_post_id::text
    or v_reader#>>'{puzzle,mode}' <> 'spot_difference'
    or v_reader#>>'{puzzle,changedImage,path}' <> v_changed_path
    or v_reader#>>'{parent,authorLabel}' <> '作者不明'
    or v_reader ? 'source_metadata'
    or (v_reader#>'{puzzle}') ? 'source_metadata' then
    raise exception 'public reader did not return its bounded normalized snapshot';
  end if;
  v_result := public.pixieed_moderate_post(v_post_id,'approve','retry',v_point,v_changed_path);
  if v_result->>'status' <> 'published' then raise exception 'same-path approval retry was not accepted'; end if;
  begin
    perform public.pixieed_moderate_post(v_post_id,'approve','retry',v_point,
      '00000000-0000-4000-8000-00000000b001/00000000-0000-4000-8000-00000000d099.png');
    raise exception 'different changed image path was accepted on re-approval';
  exception when unique_violation then null;
  end;

  update public.user_posts set status = 'hidden', published_at = null where id = v_post_id;
  if public.pixieed_read_public_puzzle(v_post_id) is not null then
    raise exception 'hidden parent was returned by public reader';
  end if;
end;
$$;

reset role;
set local role anon;
do $$
begin
  begin
    perform count(*) from public.user_post_puzzles;
    raise exception 'anon directly selected private puzzle table';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.pixieed_read_public_puzzle('00000000-0000-4000-8000-00000000b001');
    raise exception 'anon executed service-only reader RPC';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.post_map_points where post_id = '00000000-0000-4000-8000-00000000b001') <> 0 then
    raise exception 'hidden parent left a directly visible map point';
  end if;
end;
$$;

reset role;
set local role authenticated;
do $$
begin
  begin
    perform count(*) from public.user_post_puzzles;
    raise exception 'authenticated directly selected private puzzle table';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.pixieed_create_post('{}'::jsonb,'{}'::jsonb,null);
    raise exception 'authenticated executed service-only create RPC';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select 'puzzle publication database acceptance checks passed' as test_status;
rollback;
