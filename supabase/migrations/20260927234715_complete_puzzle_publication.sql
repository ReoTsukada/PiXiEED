-- Atomic, service-only database boundary for the new puzzle publication flow.
-- Existing post, location, social, and market rows are deliberately untouched.

alter table public.user_posts
  add column request_key uuid,
  add column request_digest text,
  add column submission_puzzle_mode text check (
    submission_puzzle_mode is null or submission_puzzle_mode in ('spot_difference', 'hidden_object')
  ),
  add constraint user_posts_request_pair_valid check (
    (request_key is null and request_digest is null)
    or (request_key is not null and request_digest is not null and request_digest ~ '^[0-9a-f]{64}$')
  );

drop index public.user_posts_content_hash_idx;
create index user_posts_content_hash_idx on public.user_posts (content_hash);
create unique index user_posts_author_request_key_idx
  on public.user_posts (author_id, request_key)
  where request_key is not null;

alter table public.post_map_points
  add column puzzle_mode text
    check (puzzle_mode is null or puzzle_mode in ('spot_difference', 'hidden_object'));

create function public.pixieed_json_object_size(p_value jsonb)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_count integer;
begin
  if jsonb_typeof(p_value) is distinct from 'object' then return -1; end if;
  select count(*) into v_count from jsonb_object_keys(p_value);
  return v_count;
end;
$$;

create function public.pixieed_valid_puzzle_source(p_mode text, p_source jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_ref jsonb;
begin
  if p_mode is null or jsonb_typeof(p_source) is distinct from 'object'
    or p_source->'schemaVersion' is distinct from '1'::jsonb
    or jsonb_typeof(p_source->'original') is distinct from 'object' then
    return false;
  end if;
  if p_mode = 'spot_difference' then
    if public.pixieed_json_object_size(p_source) <> 3
      or not (p_source ? 'changed')
      or jsonb_typeof(p_source->'changed') is distinct from 'object' then return false; end if;
  elsif p_mode = 'hidden_object' then
    if public.pixieed_json_object_size(p_source) <> 2 or p_source ? 'changed' then return false; end if;
  else
    return false;
  end if;

  foreach v_ref in array array[p_source->'original', p_source->'changed'] loop
    if v_ref is null then continue; end if;
    if jsonb_typeof(v_ref) is distinct from 'object' or public.pixieed_json_object_size(v_ref) <> 5
      or not (v_ref ?& array['draftId','assetId','revisionId','contentHash','hashScheme'])
      or coalesce(v_ref->>'draftId', '') !~ '^[A-Za-z0-9_-]{1,128}$'
      or coalesce(v_ref->>'assetId', '') !~ '^[A-Za-z0-9_-]{1,128}$'
      or coalesce(v_ref->>'revisionId', '') !~ '^[A-Za-z0-9_-]{1,128}$'
      or coalesce(v_ref->>'contentHash', '') !~ '^[0-9a-f]{64}$'
      or v_ref->>'hashScheme' is distinct from 'sha256-canonical-v1' then
      return false;
    end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

create function public.pixieed_valid_puzzle_definition(p_mode text, p_definition jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_width integer;
  v_height integer;
  v_rows jsonb;
  v_row jsonb;
  v_pixels jsonb;
  v_pixel jsonb;
  v_count integer;
  v_total integer := 0;
  v_distinct integer;
begin
  if p_mode is null or jsonb_typeof(p_definition) is distinct from 'object'
    or p_definition->'schemaVersion' is distinct from '1'::jsonb
    or p_definition->'confirmed' is distinct from 'true'::jsonb
    or coalesce(p_definition->>'width', '') !~ '^[0-9]{1,3}$'
    or coalesce(p_definition->>'height', '') !~ '^[0-9]{1,3}$' then return false; end if;
  v_width := (p_definition->>'width')::integer;
  v_height := (p_definition->>'height')::integer;
  if v_width < 8 or v_width > 512 or v_height < 8 or v_height > 512 then return false; end if;

  if p_mode = 'spot_difference' then
    if public.pixieed_json_object_size(p_definition) <> 5
      or not (p_definition ? 'candidates')
      or p_definition ? 'targets' or p_definition ? 'hitBoxes' then return false; end if;
    v_rows := p_definition->'candidates';
    if jsonb_typeof(v_rows) is distinct from 'array' or jsonb_array_length(v_rows) not between 1 and 256 then return false; end if;
  elsif p_mode = 'hidden_object' then
    if public.pixieed_json_object_size(p_definition) <> 6
      or not (p_definition ? 'targets') or not (p_definition ? 'hitBoxes')
      or p_definition ? 'candidates' then return false; end if;
    v_rows := p_definition->'targets';
    if jsonb_typeof(v_rows) is distinct from 'array' or jsonb_array_length(v_rows) not between 1 and 128
      or jsonb_typeof(p_definition->'hitBoxes') is distinct from 'array'
      or jsonb_array_length(p_definition->'hitBoxes') <> jsonb_array_length(v_rows) then return false; end if;
  else
    return false;
  end if;
  if octet_length(p_definition::text) > 524288 then return false; end if;

  for v_row in select value from jsonb_array_elements(v_rows) loop
    if jsonb_typeof(v_row) is distinct from 'object'
      or coalesce(v_row->>'id', '') !~ '^[A-Za-z0-9_-]{1,128}$'
      or jsonb_typeof(v_row->'pixels') is distinct from 'array' then return false; end if;
    if p_mode = 'spot_difference' then
      if public.pixieed_json_object_size(v_row) <> 2 then return false; end if;
    else
      if public.pixieed_json_object_size(v_row) <> 3
        or coalesce(char_length(btrim(v_row->>'name')), 0) not between 1 and 80 then return false; end if;
    end if;
    v_pixels := v_row->'pixels';
    v_count := jsonb_array_length(v_pixels);
    if v_count < 1 or v_count > v_width * v_height then return false; end if;
    v_total := v_total + v_count;
    if p_mode = 'hidden_object' and v_total > 131072 then return false; end if;
    select count(distinct (item.value #>> '{}')::integer)
      into v_distinct from jsonb_array_elements(v_pixels) item
      where jsonb_typeof(item.value) = 'number'
        and item.value::text ~ '^[0-9]+$'
        and (item.value #>> '{}')::integer between 0 and v_width * v_height - 1;
    if v_distinct <> v_count then return false; end if;
    if exists (
      select 1 from jsonb_array_elements(v_pixels) item
      where jsonb_typeof(item.value) <> 'number'
        or item.value::text !~ '^[0-9]+$'
        or (item.value #>> '{}')::numeric < 0
        or (item.value #>> '{}')::numeric >= v_width * v_height
    ) then return false; end if;
  end loop;

  if (select count(*) from jsonb_array_elements(v_rows)) <>
      (select count(distinct value->>'id') from jsonb_array_elements(v_rows)) then return false; end if;
  if p_mode = 'hidden_object' and (
      (select count(*) from jsonb_array_elements(v_rows)) <>
        (select count(distinct lower(value->>'name')) from jsonb_array_elements(v_rows))
      or exists (
        select 1
        from jsonb_array_elements(v_rows) target
        cross join lateral jsonb_array_elements(target.value->'pixels') pixel
        group by pixel.value
        having count(*) > 1
      )
  ) then return false; end if;
  if p_mode = 'spot_difference' and exists (
    select 1
    from jsonb_array_elements(v_rows) candidate
    cross join lateral jsonb_array_elements(candidate.value->'pixels') pixel
    group by pixel.value
    having count(*) > 1
  ) then return false; end if;

  if p_mode = 'hidden_object' and exists (
    select 1 from jsonb_array_elements(p_definition->'hitBoxes') box
    where jsonb_typeof(box.value) <> 'object'
      or jsonb_typeof(box.value) is distinct from 'object'
      or public.pixieed_json_object_size(box.value) <> 5
      or coalesce(box.value->>'targetId','') !~ '^[A-Za-z0-9_-]{1,128}$'
      or coalesce(box.value->>'minX','') !~ '^[0-9]{1,3}$'
      or coalesce(box.value->>'minY','') !~ '^[0-9]{1,3}$'
      or coalesce(box.value->>'maxX','') !~ '^[0-9]{1,3}$'
      or coalesce(box.value->>'maxY','') !~ '^[0-9]{1,3}$'
      or (box.value->>'minX')::integer > (box.value->>'maxX')::integer
      or (box.value->>'minY')::integer > (box.value->>'maxY')::integer
      or (box.value->>'maxX')::integer >= v_width
      or (box.value->>'maxY')::integer >= v_height
      or not exists (
        select 1 from jsonb_array_elements(v_rows) target
        where target.value->>'id' = box.value->>'targetId'
      )
      or (((box.value->>'maxX')::integer - (box.value->>'minX')::integer + 1) * 5 < v_width)
      or (((box.value->>'maxY')::integer - (box.value->>'minY')::integer + 1) * 5 < v_height)
  ) then return false; end if;
  if p_mode = 'hidden_object' and exists (
    select 1
    from jsonb_array_elements(p_definition->'hitBoxes') left_box
    join jsonb_array_elements(p_definition->'hitBoxes') right_box
      on left_box.value->>'targetId' < right_box.value->>'targetId'
    where (left_box.value->>'minX')::integer <= (right_box.value->>'maxX')::integer
      and (left_box.value->>'maxX')::integer >= (right_box.value->>'minX')::integer
      and (left_box.value->>'minY')::integer <= (right_box.value->>'maxY')::integer
      and (left_box.value->>'maxY')::integer >= (right_box.value->>'minY')::integer
  ) then return false; end if;
  return true;
exception when others then
  return false;
end;
$$;

create function public.pixieed_valid_image_claim(p_claim jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  return coalesce(jsonb_typeof(p_claim) = 'object'
    and public.pixieed_json_object_size(p_claim) = 5
    and p_claim->>'mimeType' = 'image/png'
    and coalesce(p_claim->>'size','') ~ '^[0-9]{1,6}$'
    and (p_claim->>'size')::integer between 1 and 524288
    and coalesce(p_claim->>'width','') ~ '^[0-9]{1,3}$'
    and (p_claim->>'width')::integer between 8 and 512
    and coalesce(p_claim->>'height','') ~ '^[0-9]{1,3}$'
    and (p_claim->>'height')::integer between 8 and 512
    and coalesce(p_claim->>'colorCount','') ~ '^[0-9]{1,3}$'
    and (p_claim->>'colorCount')::integer between 1 and 128, false);
exception when others then
  return false;
end;
$$;

create table public.user_post_puzzles (
  post_id uuid primary key references public.user_posts(id) on delete cascade,
  mode text not null check (mode in ('spot_difference', 'hidden_object')),
  schema_version integer not null check (schema_version = 1),
  source_metadata jsonb not null,
  definition jsonb not null,
  definition_hash text not null check (definition_hash ~ '^[0-9a-f]{64}$'),
  review_state text not null default 'pending' check (review_state in ('pending', 'approved', 'rejected')),
  changed_image_path text,
  changed_image_claim jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_post_puzzles_source_valid check (public.pixieed_valid_puzzle_source(mode, source_metadata)),
  constraint user_post_puzzles_definition_valid check (public.pixieed_valid_puzzle_definition(mode, definition)),
  constraint user_post_puzzles_changed_image_valid check (
    (mode = 'hidden_object' and changed_image_path is null and changed_image_claim is null)
    or (
      mode = 'spot_difference'
      and changed_image_path is not null
      and char_length(changed_image_path) between 1 and 512
      and changed_image_path !~ '(^/|\.\.|\\|[?#])'
      and changed_image_path ~ '\.png$'
      and public.pixieed_valid_image_claim(changed_image_claim)
    )
  )
);

create index user_post_puzzles_review_created_idx
  on public.user_post_puzzles (review_state, created_at desc);

alter table public.user_post_puzzles enable row level security;
revoke all on table public.user_post_puzzles from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.user_post_puzzles to service_role;

revoke all on function public.pixieed_valid_puzzle_source(text, jsonb) from public, anon, authenticated;
revoke all on function public.pixieed_valid_puzzle_definition(text, jsonb) from public, anon, authenticated;
revoke all on function public.pixieed_valid_image_claim(jsonb) from public, anon, authenticated;
grant execute on function public.pixieed_valid_puzzle_source(text, jsonb) to service_role;
grant execute on function public.pixieed_valid_puzzle_definition(text, jsonb) to service_role;
grant execute on function public.pixieed_valid_image_claim(jsonb) to service_role;
revoke all on function public.pixieed_json_object_size(jsonb) from public, anon, authenticated;
grant execute on function public.pixieed_json_object_size(jsonb) to service_role;

create function public.pixieed_lookup_post_request(
  p_author_id uuid,
  p_request_key uuid,
  p_request_digest text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_post public.user_posts%rowtype;
begin
  if p_author_id is null or p_request_key is null or p_request_digest is null
    or p_request_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'request_lookup_invalid' using errcode = '22023';
  end if;
  select * into v_post from public.user_posts
    where author_id = p_author_id and request_key = p_request_key;
  if not found then return null; end if;
  if v_post.request_digest is distinct from p_request_digest then
    raise exception 'request_digest_mismatch' using errcode = '23505';
  end if;
  if not exists (select 1 from public.post_locations_private where post_id = v_post.id)
    or (v_post.submission_puzzle_mode is null and exists (
      select 1 from public.user_post_puzzles puzzle where puzzle.post_id = v_post.id
    ))
    or (v_post.submission_puzzle_mode is not null and not exists (
      select 1 from public.user_post_puzzles puzzle
      where puzzle.post_id = v_post.id and puzzle.mode = v_post.submission_puzzle_mode
    )) then
    raise exception 'request_replay_incomplete' using errcode = '23514';
  end if;
  return jsonb_build_object('postId', v_post.id, 'status', v_post.status::text, 'replayed', true);
end;
$$;

create function public.pixieed_create_post(
  p_post jsonb,
  p_location jsonb,
  p_puzzle jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_post public.user_posts%rowtype;
  v_location public.post_locations_private%rowtype;
  v_post_id uuid;
  v_existing public.user_posts%rowtype;
  v_expected_keys text[] := array[
    'id','author_id','title','caption','post_kind','image_path','image_mime','image_bytes',
    'image_width','image_height','color_count','content_hash','status','request_key','request_digest'
  ];
  v_location_keys text[] := array[
    'post_id','latitude','longitude','accuracy_m','source','map_space','cell_grid','cell_x','cell_y',
    'prefecture_code','captured_at','projection_version','globe_cell_id','globe_band','globe_column'
  ];
  v_puzzle_keys text[] := array[
    'mode','schema_version','source_metadata','definition','definition_hash','changed_image_path',
    'changed_image_claim'
  ];
  v_request_key uuid;
  v_request_digest text;
  v_inserted_id uuid;
  v_has_puzzle boolean := p_puzzle is not null;
begin
  if jsonb_typeof(p_post) is distinct from 'object'
    or not (p_post ?& array['id','author_id','title','caption','post_kind','image_path','image_mime','image_bytes','image_width','image_height','color_count','content_hash','status'])
    or (p_post - v_expected_keys) <> '{}'::jsonb then
    raise exception 'post_payload_invalid' using errcode = '22023';
  end if;
  if jsonb_typeof(p_location) is distinct from 'object'
    or (p_location - v_location_keys) <> '{}'::jsonb
    or (p_location ? 'post_id' and p_location->>'post_id' is distinct from p_post->>'id') then
    raise exception 'post_location_invalid' using errcode = '22023';
  end if;
  select * into v_post from jsonb_populate_record(null::public.user_posts, p_post);
  v_post_id := v_post.id;
  v_request_key := v_post.request_key;
  v_request_digest := v_post.request_digest;
  if v_post.status is distinct from 'pending' or v_post.published_at is not null
    or v_post.image_mime is distinct from 'image/png'
    or v_post.image_width not between 8 and 512 or v_post.image_height not between 8 and 512
    or v_post.image_bytes not between 1 and 524288
    or v_post.color_count is null or v_post.color_count not between 1 and 128
    or ((v_request_key is null) <> (v_request_digest is null))
    or (v_request_digest is not null and v_request_digest !~ '^[0-9a-f]{64}$') then
    raise exception 'post_payload_invalid' using errcode = '22023';
  end if;

  select * into v_location
    from jsonb_populate_record(null::public.post_locations_private,
      p_location || jsonb_build_object('post_id', v_post_id));

  if v_has_puzzle then
    if jsonb_typeof(p_puzzle) is distinct from 'object'
      or (p_puzzle - v_puzzle_keys) <> '{}'::jsonb
      or not (p_puzzle ?& array['mode','schema_version','source_metadata','definition','definition_hash'])
      or p_puzzle->'schema_version' is distinct from '1'::jsonb
      or p_puzzle->>'mode' not in ('spot_difference','hidden_object')
      or p_puzzle->>'definition_hash' !~ '^[0-9a-f]{64}$'
      or not public.pixieed_valid_puzzle_source(p_puzzle->>'mode', p_puzzle->'source_metadata')
      or not public.pixieed_valid_puzzle_definition(p_puzzle->>'mode', p_puzzle->'definition') then
      raise exception 'post_puzzle_invalid' using errcode = '22023';
    end if;
    if (p_puzzle->'definition'->>'width')::integer <> v_post.image_width
      or (p_puzzle->'definition'->>'height')::integer <> v_post.image_height then
      raise exception 'post_puzzle_dimensions_mismatch' using errcode = '22023';
    end if;
    if p_puzzle->>'mode' = 'spot_difference' then
      if p_puzzle->>'changed_image_path' is null
        or not public.pixieed_valid_image_claim(p_puzzle->'changed_image_claim')
        or (p_puzzle->'changed_image_claim'->>'width')::integer <> v_post.image_width
        or (p_puzzle->'changed_image_claim'->>'height')::integer <> v_post.image_height then
        raise exception 'post_puzzle_changed_image_invalid' using errcode = '22023';
      end if;
    elsif p_puzzle ? 'changed_image_path' or p_puzzle ? 'changed_image_claim' then
      raise exception 'post_puzzle_changed_image_unexpected' using errcode = '22023';
    end if;
  end if;

  if v_request_key is not null then
    insert into public.user_posts (
      id, author_id, title, caption, post_kind, image_path, image_mime, image_bytes,
      image_width, image_height, color_count, content_hash, status, request_key, request_digest, submission_puzzle_mode
    ) values (
      v_post.id, v_post.author_id, v_post.title, v_post.caption, v_post.post_kind,
      v_post.image_path, v_post.image_mime, v_post.image_bytes, v_post.image_width,
      v_post.image_height, v_post.color_count, v_post.content_hash, v_post.status,
      v_request_key, v_request_digest, case when v_has_puzzle then p_puzzle->>'mode' else null end
    ) on conflict (author_id, request_key) where request_key is not null do nothing
    returning id into v_inserted_id;
  else
    insert into public.user_posts (
      id, author_id, title, caption, post_kind, image_path, image_mime, image_bytes,
      image_width, image_height, color_count, content_hash, status, request_key, request_digest, submission_puzzle_mode
    ) values (
      v_post.id, v_post.author_id, v_post.title, v_post.caption, v_post.post_kind,
      v_post.image_path, v_post.image_mime, v_post.image_bytes, v_post.image_width,
      v_post.image_height, v_post.color_count, v_post.content_hash, v_post.status,
      null, null, case when v_has_puzzle then p_puzzle->>'mode' else null end
    ) returning id into v_inserted_id;
  end if;

  if v_inserted_id is null then
    select * into v_existing from public.user_posts
      where author_id = v_post.author_id and request_key = v_request_key;
    if not found then raise exception 'request_replay_unavailable' using errcode = '40001'; end if;
    if v_existing.request_digest is distinct from v_request_digest then
      raise exception 'request_digest_mismatch' using errcode = '23505';
    end if;
    if not exists (select 1 from public.post_locations_private where post_id = v_existing.id)
      or (v_existing.submission_puzzle_mode is distinct from (case when v_has_puzzle then p_puzzle->>'mode' else null end))
      or (v_has_puzzle and not exists (select 1 from public.user_post_puzzles where post_id = v_existing.id and mode = p_puzzle->>'mode'))
      or (not v_has_puzzle and exists (select 1 from public.user_post_puzzles where post_id = v_existing.id)) then
      raise exception 'request_replay_incomplete' using errcode = '23514';
    end if;
    return jsonb_build_object('postId', v_existing.id, 'status', v_existing.status::text, 'replayed', true);
  end if;

  insert into public.post_locations_private (
    post_id, latitude, longitude, accuracy_m, source, map_space, cell_grid, cell_x,
    cell_y, prefecture_code, captured_at, projection_version, globe_cell_id, globe_band, globe_column
  ) values (
    v_post_id, v_location.latitude, v_location.longitude, v_location.accuracy_m,
    v_location.source, coalesce(v_location.map_space, 'japan'), v_location.cell_grid,
    v_location.cell_x, v_location.cell_y, v_location.prefecture_code, v_location.captured_at,
    v_location.projection_version, v_location.globe_cell_id, v_location.globe_band, v_location.globe_column
  );

  if v_has_puzzle then
    insert into public.user_post_puzzles (
      post_id, mode, schema_version, source_metadata, definition, definition_hash,
      review_state, changed_image_path, changed_image_claim
    ) values (
      v_post_id, p_puzzle->>'mode', (p_puzzle->>'schema_version')::integer,
      p_puzzle->'source_metadata', p_puzzle->'definition', p_puzzle->>'definition_hash',
      'pending', p_puzzle->>'changed_image_path', p_puzzle->'changed_image_claim'
    );
  end if;
  return jsonb_build_object('postId', v_post_id, 'status', 'pending', 'replayed', false);
end;
$$;

create function public.pixieed_moderate_post(
  p_post_id uuid,
  p_action text,
  p_note text,
  p_point jsonb default null,
  p_changed_public_path text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_post public.user_posts%rowtype;
  v_puzzle public.user_post_puzzles%rowtype;
  v_location public.post_locations_private%rowtype;
  v_point public.post_map_points%rowtype;
  v_published_at timestamptz;
  v_point_keys text[] := array[
    'post_id','map_space','projection_version','cell_grid','cell_x','cell_y','prefecture_code',
    'title','caption','public_image_path','published_at','post_kind','globe_cell_id','globe_band','globe_column','puzzle_mode'
  ];
begin
  if p_post_id is null or p_action is null or p_action not in ('approve','reject') then
    raise exception 'moderation_action_invalid' using errcode = '22023';
  end if;
  select * into v_post from public.user_posts where id = p_post_id for update;
  if not found then raise exception 'post_not_found' using errcode = 'P0002'; end if;
  select * into v_puzzle from public.user_post_puzzles where post_id = p_post_id for update;

  if v_post.status = 'published' and p_action = 'approve' then
    if p_point is null or jsonb_typeof(p_point) <> 'object'
      or (p_point - v_point_keys) <> '{}'::jsonb
      or p_point->>'post_id' <> p_post_id::text
      or not exists (select 1 from public.post_map_points point
        where point.post_id = p_post_id
          and point.public_image_path = p_point->>'public_image_path') then
      raise exception 'post_already_published_different_path' using errcode = '23505';
    end if;
    if v_puzzle.post_id is not null then
      if v_puzzle.review_state <> 'approved'
        or (v_puzzle.mode = 'spot_difference' and v_puzzle.changed_image_path is distinct from p_changed_public_path)
        or (v_puzzle.mode = 'hidden_object' and p_changed_public_path is not null) then
        raise exception 'post_already_published_different_path' using errcode = '23505';
      end if;
    elsif p_changed_public_path is not null then
      raise exception 'post_already_published_different_path' using errcode = '23505';
    end if;
    return jsonb_build_object('postId', p_post_id, 'status', 'published');
  end if;
  if v_post.status <> 'pending' then raise exception 'post_not_pending' using errcode = '23514'; end if;

  if p_action = 'reject' then
    update public.user_posts set status = 'rejected', published_at = null,
      moderation_note = coalesce(nullif(left(btrim(p_note), 500), ''), '管理者確認で公開しない投稿です。'),
      updated_at = now()
      where id = p_post_id;
    if v_puzzle.post_id is not null then
      update public.user_post_puzzles set review_state = 'rejected', updated_at = now()
        where post_id = p_post_id;
    end if;
    return jsonb_build_object('postId', p_post_id, 'status', 'rejected');
  end if;

  if p_point is null or jsonb_typeof(p_point) <> 'object'
    or (p_point - v_point_keys) <> '{}'::jsonb
    or not (p_point ?& array['post_id','map_space','projection_version','title','caption','public_image_path','published_at','post_kind'])
    or p_point->>'post_id' <> p_post_id::text
    or p_point->>'title' <> v_post.title
    or p_point->>'caption' <> v_post.caption
    or p_point->>'post_kind' <> v_post.post_kind::text
    or p_point->>'public_image_path' is null
    or p_point->>'public_image_path' !~ ('^' || p_post_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.' || case when v_post.image_mime = 'image/webp' then 'webp' else 'png' end || '$')
    or p_point->>'puzzle_mode' is distinct from (case when v_puzzle.post_id is null then null else v_puzzle.mode end) then
    raise exception 'public_map_point_invalid' using errcode = '22023';
  end if;
  begin v_published_at := (p_point->>'published_at')::timestamptz;
  exception when others then raise exception 'public_map_point_invalid' using errcode = '22023'; end;
  select * into v_location from public.post_locations_private where post_id = p_post_id;
  if not found or p_point->>'map_space' is distinct from v_location.map_space then
    raise exception 'public_map_point_location_mismatch' using errcode = '22023';
  end if;
  if v_location.map_space = 'globe' and (
      p_point->>'projection_version' is distinct from v_location.projection_version
      or p_point->>'globe_cell_id' is distinct from v_location.globe_cell_id
      or (p_point->>'globe_band')::integer is distinct from v_location.globe_band
      or (p_point->>'globe_column')::integer is distinct from v_location.globe_column
  ) then raise exception 'public_map_point_location_mismatch' using errcode = '22023'; end if;
  if v_location.map_space = 'japan' and (
      p_point->>'cell_grid' is distinct from v_location.cell_grid::text
      or p_point->>'cell_x' is distinct from v_location.cell_x::text
      or p_point->>'cell_y' is distinct from v_location.cell_y::text
      or p_point->>'prefecture_code' is distinct from v_location.prefecture_code
  ) then raise exception 'public_map_point_location_mismatch' using errcode = '22023'; end if;

  if v_puzzle.post_id is not null then
    if v_puzzle.review_state <> 'pending' then raise exception 'puzzle_not_pending' using errcode = '23514'; end if;
    if v_puzzle.mode = 'spot_difference' then
      if p_changed_public_path is null or char_length(p_changed_public_path) > 512
        or p_changed_public_path !~ ('^' || p_post_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$')
        or p_changed_public_path = p_point->>'public_image_path' then
        raise exception 'changed_public_path_invalid' using errcode = '22023';
      end if;
    elsif p_changed_public_path is not null then
      raise exception 'changed_public_path_unexpected' using errcode = '22023';
    end if;
  elsif p_changed_public_path is not null then
    raise exception 'changed_public_path_unexpected' using errcode = '22023';
  end if;

  select * into v_point from jsonb_populate_record(null::public.post_map_points, p_point);
  insert into public.post_map_points (
    post_id,map_space,projection_version,cell_grid,cell_x,cell_y,prefecture_code,
    title,caption,public_image_path,published_at,post_kind,globe_cell_id,globe_band,globe_column,puzzle_mode
  ) values (
    p_post_id,v_point.map_space,v_point.projection_version,v_point.cell_grid,v_point.cell_x,
    v_point.cell_y,v_point.prefecture_code,v_post.title,v_post.caption,v_point.public_image_path,
    v_published_at,v_post.post_kind,v_point.globe_cell_id,v_point.globe_band,v_point.globe_column,
    case when v_puzzle.post_id is null then null else v_puzzle.mode end
  ) on conflict (post_id) do update set
    map_space = excluded.map_space, projection_version = excluded.projection_version,
    cell_grid = excluded.cell_grid, cell_x = excluded.cell_x, cell_y = excluded.cell_y,
    prefecture_code = excluded.prefecture_code, title = excluded.title, caption = excluded.caption,
    public_image_path = excluded.public_image_path, published_at = excluded.published_at,
    post_kind = excluded.post_kind, globe_cell_id = excluded.globe_cell_id,
    globe_band = excluded.globe_band, globe_column = excluded.globe_column, puzzle_mode = excluded.puzzle_mode;

  update public.user_posts set status = 'published', published_at = v_published_at,
    moderation_note = coalesce(left(btrim(p_note), 500), ''), updated_at = now()
    where id = p_post_id;
  if v_puzzle.post_id is not null then
    update public.user_post_puzzles set review_state = 'approved',
      changed_image_path = case when mode = 'spot_difference' then p_changed_public_path else null end,
      updated_at = now() where post_id = p_post_id;
  end if;
  return jsonb_build_object('postId', p_post_id, 'status', 'published');
end;
$$;

create function public.pixieed_read_public_puzzle(p_post_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'requestedPostId', post.id,
    'parent', jsonb_build_object(
      'id', post.id,
      'status', post.status::text,
      'publishedAt', post.published_at,
      'title', post.title,
      'authorLabel', '作者不明',
      'imageClaim', jsonb_build_object(
        'mimeType', post.image_mime, 'size', post.image_bytes,
        'width', post.image_width, 'height', post.image_height, 'colorCount', post.color_count
      )
    ),
    'point', jsonb_build_object(
      'postId', point.post_id, 'publishedAt', point.published_at, 'imagePath', point.public_image_path
    ),
    'puzzle', jsonb_build_object(
      'postId', puzzle.post_id, 'reviewState', puzzle.review_state, 'mode', puzzle.mode,
      'schemaVersion', puzzle.schema_version, 'definition', puzzle.definition
    ) || case when puzzle.mode = 'spot_difference' then jsonb_build_object(
      'changedImage', jsonb_build_object('path', puzzle.changed_image_path, 'claim', puzzle.changed_image_claim)
    ) else '{}'::jsonb end
  )
  from public.user_posts post
  join public.post_map_points point on point.post_id = post.id
  join public.user_post_puzzles puzzle on puzzle.post_id = post.id
  where post.id = p_post_id
    and post.status = 'published' and post.published_at is not null
    and point.published_at is not null and point.puzzle_mode = puzzle.mode
    and puzzle.review_state = 'approved'
$$;

revoke all on function public.pixieed_lookup_post_request(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.pixieed_create_post(jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.pixieed_moderate_post(uuid, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.pixieed_read_public_puzzle(uuid) from public, anon, authenticated;
grant execute on function public.pixieed_lookup_post_request(uuid, uuid, text) to service_role;
grant execute on function public.pixieed_create_post(jsonb, jsonb, jsonb) to service_role;
grant execute on function public.pixieed_moderate_post(uuid, text, text, jsonb, text) to service_role;
grant execute on function public.pixieed_read_public_puzzle(uuid) to service_role;
