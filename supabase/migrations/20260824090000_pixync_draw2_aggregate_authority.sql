-- PiXYNC Draw2 aggregate authority.
-- Reuses collab_v1 room membership without mixing Draw2 revisions with the
-- legacy pixel-patch operation stream.

create table if not exists collab_v1.draw2_project_heads (
  room_id uuid primary key references collab_v1.rooms(id) on delete cascade,
  project_revision bigint not null default 0 check (project_revision >= 0),
  draw_revision bigint not null default 0 check (draw_revision >= 0),
  audio_revision bigint not null default 0 check (audio_revision >= 0),
  game_revision bigint not null default 0 check (game_revision >= 0),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists collab_v1.draw2_sessions (
  room_id uuid not null references collab_v1.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null check (client_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'),
  generation bigint not null check (generation >= 0),
  membership_revision text not null,
  last_seen_at timestamptz not null default timezone('utc', now()),
  primary key (room_id, user_id, client_id)
);

create table if not exists collab_v1.draw2_operations (
  room_id uuid not null references collab_v1.rooms(id) on delete cascade,
  project_revision bigint not null check (project_revision > 0),
  aggregate text not null check (aggregate in ('draw', 'audio', 'game')),
  aggregate_revision bigint not null check (aggregate_revision > 0),
  operation_id text not null check (operation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  client_id text not null,
  submission_fingerprint text not null check (submission_fingerprint ~ '^[a-f0-9]{64}$'),
  committed_fingerprint text not null check (committed_fingerprint ~ '^[a-f0-9]{64}$'),
  operation jsonb not null check (jsonb_typeof(operation) = 'object'),
  committed_at timestamptz not null default timezone('utc', now()),
  primary key (room_id, project_revision),
  unique (room_id, operation_id),
  unique (room_id, aggregate, aggregate_revision)
);

create index if not exists pixync_draw2_operations_room_aggregate_idx
  on collab_v1.draw2_operations (room_id, aggregate, aggregate_revision);

create table if not exists collab_v1.draw2_game_revisions (
  room_id uuid not null references collab_v1.rooms(id) on delete cascade,
  snapshot_hash text not null check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  revision_id text not null check (revision_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'),
  sequence bigint not null check (sequence > 0),
  project jsonb not null check (jsonb_typeof(project) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (room_id, snapshot_hash),
  unique (room_id, revision_id)
);

alter table collab_v1.draw2_project_heads enable row level security;
alter table collab_v1.draw2_sessions enable row level security;
alter table collab_v1.draw2_operations enable row level security;
alter table collab_v1.draw2_game_revisions enable row level security;
revoke all on collab_v1.draw2_project_heads from public, anon, authenticated;
revoke all on collab_v1.draw2_sessions from public, anon, authenticated;
revoke all on collab_v1.draw2_operations from public, anon, authenticated;
revoke all on collab_v1.draw2_game_revisions from public, anon, authenticated;

create or replace function collab_v1.draw2_canonical_json(p_value jsonb)
returns text
language plpgsql immutable strict
set search_path = ''
as $$
declare
  v_type text := jsonb_typeof(p_value);
  v_result text;
begin
  if v_type in ('null', 'boolean', 'number', 'string') then
    return p_value::text;
  end if;
  if v_type = 'array' then
    select '[' || coalesce(string_agg(
      collab_v1.draw2_canonical_json(item.value), ',' order by item.ordinality
    ), '') || ']'
    into v_result
    from jsonb_array_elements(p_value) with ordinality as item(value, ordinality);
    return v_result;
  end if;
  if v_type = 'object' then
    select '{' || coalesce(string_agg(
      to_jsonb(item.key)::text || ':' ||
        collab_v1.draw2_canonical_json(item.value),
      ',' order by item.key
    ), '') || '}'
    into v_result
    from jsonb_each(p_value) as item(key, value);
    return v_result;
  end if;
  raise exception 'pixync_draw2_non_json_value';
end;
$$;

create or replace function collab_v1.draw2_has_forbidden_key(p_value jsonb)
returns boolean
language plpgsql immutable strict
set search_path = ''
as $$
declare
  v_key text;
  v_child jsonb;
begin
  if jsonb_typeof(p_value) = 'array' then
    for v_child in select value from jsonb_array_elements(p_value) loop
      if collab_v1.draw2_has_forbidden_key(v_child) then return true; end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'object' then
    for v_key, v_child in select key, value from jsonb_each(p_value) loop
      if replace(lower(v_key), '_', '') ~ '(pointer|preview|snapshot|rawaudioblob|audioblob|blob|dom)' then
        return true;
      end if;
      if collab_v1.draw2_has_forbidden_key(v_child) then return true; end if;
    end loop;
  end if;
  return false;
end;
$$;

create or replace function collab_v1.draw2_membership_revision(
  p_room_id uuid,
  p_user_id uuid
)
returns text
language sql stable security definer
set search_path = ''
as $$
  select md5(
    member.room_id::text || ':' || member.user_id::text || ':' ||
    member.role::text || ':' || member.joined_at::text || ':' ||
    coalesce(member.revoked_at::text, 'active')
  )
  from collab_v1.room_members as member
  where member.room_id = p_room_id and member.user_id = p_user_id;
$$;

create or replace function public.pixync_draw2_open_session_v1(
  p_project_id text,
  p_client_id text,
  p_session_generation bigint
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room_id uuid;
  v_room collab_v1.rooms%rowtype;
  v_member collab_v1.room_members%rowtype;
  v_membership_revision text;
  v_previous_generation bigint;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_project_id is null or p_project_id !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$' then
    raise exception 'pixync_draw2_invalid_project';
  end if;
  begin v_room_id := p_project_id::uuid;
  exception when invalid_text_representation then
    raise exception 'pixync_draw2_project_not_room';
  end;
  if p_client_id is null or p_client_id !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
     or p_session_generation is null or p_session_generation < 0 then
    raise exception 'pixync_draw2_invalid_session';
  end if;
  select * into v_room from collab_v1.rooms where id = v_room_id and status = 'active';
  if not found then raise exception 'room_not_active'; end if;
  select * into v_member from collab_v1.room_members
    where room_id = v_room_id and user_id = v_user_id and revoked_at is null;
  if not found then raise exception 'not_active_member'; end if;
  v_membership_revision := collab_v1.draw2_membership_revision(v_room_id, v_user_id);
  select generation into v_previous_generation
    from collab_v1.draw2_sessions
    where room_id = v_room_id and user_id = v_user_id and client_id = p_client_id
    for update;
  if found and p_session_generation < v_previous_generation then
    raise exception 'pixync_draw2_stale_session';
  end if;
  insert into collab_v1.draw2_sessions (
    room_id, user_id, client_id, generation, membership_revision, last_seen_at
  ) values (
    v_room_id, v_user_id, p_client_id, p_session_generation,
    v_membership_revision, timezone('utc', now())
  ) on conflict (room_id, user_id, client_id) do update set
    generation = excluded.generation,
    membership_revision = excluded.membership_revision,
    last_seen_at = excluded.last_seen_at;
  insert into collab_v1.draw2_project_heads (room_id) values (v_room_id)
    on conflict (room_id) do nothing;
  return jsonb_build_object(
    'principal_id', v_user_id::text,
    'project_id', p_project_id,
    'room_id', v_room_id::text,
    'actor_id', v_user_id::text,
    'membership_id', md5(v_room_id::text || ':' || v_user_id::text)::uuid::text,
    'membership_revision', v_membership_revision,
    'client_id', p_client_id,
    'session_generation', p_session_generation,
    'role', v_member.role::text
  );
end;
$$;

create or replace function public.pixync_draw2_commit_operation_v1(
  p_project_id text,
  p_client_id text,
  p_session_generation bigint,
  p_operation jsonb
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room_id uuid;
  v_member collab_v1.room_members%rowtype;
  v_session collab_v1.draw2_sessions%rowtype;
  v_head collab_v1.draw2_project_heads%rowtype;
  v_existing collab_v1.draw2_operations%rowtype;
  v_aggregate text;
  v_aggregate_base bigint;
  v_aggregate_next bigint;
  v_project_next bigint;
  v_submission_body jsonb;
  v_sanitized_operation jsonb;
  v_submission_fingerprint text;
  v_committed_fingerprint text;
  v_committed jsonb;
  v_committed_at timestamptz := timezone('utc', now());
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  begin v_room_id := p_project_id::uuid;
  exception when invalid_text_representation then raise exception 'pixync_draw2_project_not_room'; end;
  select * into v_member from collab_v1.room_members
    where room_id = v_room_id and user_id = v_user_id and revoked_at is null;
  if not found or v_member.role not in ('owner', 'editor') then raise exception 'not_editor'; end if;
  select * into v_session from collab_v1.draw2_sessions
    where room_id = v_room_id and user_id = v_user_id and client_id = p_client_id;
  if not found or v_session.generation <> p_session_generation or
     v_session.membership_revision <>
       collab_v1.draw2_membership_revision(v_room_id, v_user_id) then
    raise exception 'pixync_draw2_stale_session';
  end if;
  if jsonb_typeof(p_operation) <> 'object'
     or not (p_operation ?& array[
       'schemaVersion', 'operationId', 'projectId', 'aggregate', 'actorId',
       'clientId', 'clientSequence', 'baseProjectRevision',
       'aggregateRevision', 'payloadHash', 'payload'
     ])
     or exists (
       select 1 from jsonb_object_keys(p_operation) as supplied(key)
       where supplied.key not in (
         'schemaVersion', 'operationId', 'projectId', 'aggregate', 'actorId',
         'clientId', 'clientSequence', 'baseProjectRevision',
         'aggregateRevision', 'payloadHash', 'payload', 'compensation'
       )
     )
     or p_operation->>'schemaVersion' <> 'PIXYNC_DRAW2_OPERATION_V1'
     or p_operation->>'projectId' <> p_project_id or p_operation->>'clientId' <> p_client_id
     or p_operation->>'actorId' <> v_user_id::text
     or coalesce(p_operation->>'operationId', '') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
     or p_operation->>'aggregate' not in ('draw', 'audio', 'game')
     or jsonb_typeof(p_operation->'payload') <> 'object'
     or octet_length(convert_to(collab_v1.draw2_canonical_json(p_operation), 'utf8')) > 24576
     or octet_length(convert_to(collab_v1.draw2_canonical_json(p_operation->'payload'), 'utf8')) > 16384
     or collab_v1.draw2_has_forbidden_key(p_operation->'payload')
     or (p_operation ? 'compensation' and jsonb_typeof(p_operation->'compensation') <> 'object')
     or (p_operation ? 'projectRevision') or (p_operation ? 'committedAt') then
    raise exception 'pixync_draw2_invalid_operation';
  end if;
  if (p_operation->>'clientSequence')::bigint < 0
     or (p_operation->>'baseProjectRevision')::bigint < 0
     or (p_operation->>'aggregateRevision')::bigint < 0 then
    raise exception 'pixync_draw2_invalid_revision';
  end if;
  if p_operation->>'payloadHash' <>
    encode(extensions.digest(convert_to(collab_v1.draw2_canonical_json(p_operation->'payload'), 'utf8'), 'sha256'), 'hex') then
    raise exception 'pixync_draw2_payload_hash_mismatch';
  end if;
  v_submission_body := jsonb_build_object(
    'schemaVersion', p_operation->'schemaVersion',
    'operationId', p_operation->'operationId',
    'projectId', p_operation->'projectId',
    'aggregate', p_operation->'aggregate',
    'actorId', p_operation->'actorId',
    'clientId', p_operation->'clientId',
    'clientSequence', p_operation->'clientSequence',
    'baseProjectRevision', p_operation->'baseProjectRevision',
    'payloadHash', p_operation->'payloadHash',
    'payload', p_operation->'payload'
  );
  if p_operation ? 'compensation' then
    v_submission_body := v_submission_body || jsonb_build_object('compensation', p_operation->'compensation');
  end if;
  v_sanitized_operation := v_submission_body || jsonb_build_object(
    'aggregateRevision', p_operation->'aggregateRevision'
  );
  v_submission_fingerprint := encode(extensions.digest(
    convert_to(collab_v1.draw2_canonical_json(v_submission_body), 'utf8'), 'sha256'
  ), 'hex');
  select * into v_existing from collab_v1.draw2_operations
    where room_id = v_room_id and operation_id = p_operation->>'operationId';
  if found then
    if v_existing.submission_fingerprint <> v_submission_fingerprint then
      raise exception 'pixync_draw2_idempotency_conflict';
    end if;
    return jsonb_build_object(
      'kind', 'DUPLICATE', 'operation_id', v_existing.operation_id,
      'project_id', p_project_id, 'project_revision', v_existing.project_revision,
      'aggregate_revision', v_existing.aggregate_revision,
      'submission_fingerprint', v_existing.submission_fingerprint,
      'committed_fingerprint', v_existing.committed_fingerprint,
      'operation', v_existing.operation
    );
  end if;
  insert into collab_v1.draw2_project_heads (room_id) values (v_room_id)
    on conflict (room_id) do nothing;
  select * into v_head from collab_v1.draw2_project_heads where room_id = v_room_id for update;
  if (p_operation->>'baseProjectRevision')::bigint > v_head.project_revision then
    raise exception 'pixync_draw2_future_project_base';
  end if;
  v_aggregate := p_operation->>'aggregate';
  v_aggregate_base := case v_aggregate
    when 'draw' then v_head.draw_revision
    when 'audio' then v_head.audio_revision
    else v_head.game_revision end;
  if (p_operation->>'aggregateRevision')::bigint <> v_aggregate_base then
    raise exception 'pixync_draw2_aggregate_revision_stale';
  end if;
  v_project_next := v_head.project_revision + 1;
  v_aggregate_next := v_aggregate_base + 1;
  v_committed := v_sanitized_operation || jsonb_build_object(
    'projectRevision', v_project_next,
    'aggregateRevision', v_aggregate_next,
    'committedAt', to_char(v_committed_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  v_committed_fingerprint := encode(extensions.digest(convert_to(
    collab_v1.draw2_canonical_json(jsonb_build_object(
      'submissionFingerprint', v_submission_fingerprint,
      'projectRevision', v_project_next,
      'aggregateRevision', v_aggregate_next
    )), 'utf8'), 'sha256'), 'hex');
  insert into collab_v1.draw2_operations (
    room_id, project_revision, aggregate, aggregate_revision, operation_id,
    actor_user_id, client_id, submission_fingerprint, committed_fingerprint,
    operation, committed_at
  ) values (
    v_room_id, v_project_next, v_aggregate, v_aggregate_next,
    p_operation->>'operationId', v_user_id, p_client_id,
    v_submission_fingerprint, v_committed_fingerprint, v_committed, v_committed_at
  );
  update collab_v1.draw2_project_heads set
    project_revision = v_project_next,
    draw_revision = case when v_aggregate = 'draw' then v_aggregate_next else draw_revision end,
    audio_revision = case when v_aggregate = 'audio' then v_aggregate_next else audio_revision end,
    game_revision = case when v_aggregate = 'game' then v_aggregate_next else game_revision end,
    updated_at = v_committed_at
  where room_id = v_room_id;
  perform realtime.send(
    jsonb_build_object('projectRevision', v_project_next),
    'pixync_hint', 'pixync:room:' || v_room_id::text, true
  );
  return jsonb_build_object(
    'kind', 'COMMITTED', 'operation_id', p_operation->>'operationId',
    'project_id', p_project_id, 'project_revision', v_project_next,
    'aggregate_revision', v_aggregate_next,
    'submission_fingerprint', v_submission_fingerprint,
    'committed_fingerprint', v_committed_fingerprint,
    'operation', v_committed
  );
end;
$$;

create or replace function public.pixync_draw2_get_operations_since_v1(
  p_project_id text,
  p_after_project_revision bigint,
  p_client_id text,
  p_session_generation bigint
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room_id uuid;
  v_session collab_v1.draw2_sessions%rowtype;
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  begin v_room_id := p_project_id::uuid;
  exception when invalid_text_representation then raise exception 'pixync_draw2_project_not_room'; end;
  if not exists (
    select 1 from collab_v1.room_members where room_id = v_room_id
      and user_id = v_user_id and revoked_at is null
  ) then raise exception 'not_active_member'; end if;
  select * into v_session from collab_v1.draw2_sessions
    where room_id = v_room_id and user_id = v_user_id and client_id = p_client_id;
  if not found or v_session.generation <> p_session_generation or
     v_session.membership_revision <>
       collab_v1.draw2_membership_revision(v_room_id, v_user_id) then
    raise exception 'pixync_draw2_stale_session';
  end if;
  if p_after_project_revision is null or p_after_project_revision < 0 then
    raise exception 'pixync_draw2_invalid_revision';
  end if;
  select coalesce(jsonb_agg(op.operation order by op.project_revision), '[]'::jsonb)
    into v_result
  from collab_v1.draw2_operations as op
  where op.room_id = v_room_id and op.project_revision > p_after_project_revision;
  return v_result;
end;
$$;

create or replace function public.pixync_draw2_put_game_revision_v1(
  p_project_id text,
  p_client_id text,
  p_session_generation bigint,
  p_snapshot_hash text,
  p_revision_id text,
  p_sequence bigint,
  p_game_project jsonb
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room_id uuid;
  v_member collab_v1.room_members%rowtype;
  v_session collab_v1.draw2_sessions%rowtype;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  begin v_room_id := p_project_id::uuid;
  exception when invalid_text_representation then raise exception 'pixync_draw2_project_not_room'; end;
  select * into v_member from collab_v1.room_members
    where room_id = v_room_id and user_id = v_user_id and revoked_at is null;
  if not found or v_member.role not in ('owner', 'editor') then raise exception 'not_editor'; end if;
  select * into v_session from collab_v1.draw2_sessions
    where room_id = v_room_id and user_id = v_user_id and client_id = p_client_id;
  if not found or v_session.generation <> p_session_generation or
     v_session.membership_revision <>
       collab_v1.draw2_membership_revision(v_room_id, v_user_id) then
    raise exception 'pixync_draw2_stale_session';
  end if;
  if p_snapshot_hash !~ '^[a-f0-9]{64}$'
     or p_revision_id !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
     or p_sequence is null or p_sequence < 1
     or jsonb_typeof(p_game_project) <> 'object'
     or p_game_project->>'projectId' <> p_project_id
     or p_game_project#>>'{revision,snapshotHash}' <> p_snapshot_hash
     or p_game_project#>>'{revision,revisionId}' <> p_revision_id
     or (p_game_project#>>'{revision,sequence}')::bigint <> p_sequence
     or octet_length(convert_to(collab_v1.draw2_canonical_json(p_game_project), 'utf8')) > 524288 then
    raise exception 'pixync_draw2_invalid_game_revision';
  end if;
  insert into collab_v1.draw2_game_revisions (
    room_id, snapshot_hash, revision_id, sequence, project, created_by
  ) values (
    v_room_id, p_snapshot_hash, p_revision_id, p_sequence, p_game_project, v_user_id
  ) on conflict (room_id, snapshot_hash) do nothing;
  if not exists (
    select 1 from collab_v1.draw2_game_revisions
    where room_id = v_room_id and snapshot_hash = p_snapshot_hash
      and revision_id = p_revision_id and sequence = p_sequence
  ) then raise exception 'pixync_draw2_game_revision_conflict'; end if;
  return jsonb_build_object(
    'project_id', p_project_id,
    'snapshot_hash', p_snapshot_hash,
    'revision_id', p_revision_id,
    'sequence', p_sequence
  );
end;
$$;

create or replace function public.pixync_draw2_get_game_revision_v1(
  p_project_id text,
  p_client_id text,
  p_session_generation bigint,
  p_snapshot_hash text,
  p_revision_id text
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room_id uuid;
  v_session collab_v1.draw2_sessions%rowtype;
  v_project jsonb;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  begin v_room_id := p_project_id::uuid;
  exception when invalid_text_representation then raise exception 'pixync_draw2_project_not_room'; end;
  if not exists (
    select 1 from collab_v1.room_members where room_id = v_room_id
      and user_id = v_user_id and revoked_at is null
  ) then raise exception 'not_active_member'; end if;
  select * into v_session from collab_v1.draw2_sessions
    where room_id = v_room_id and user_id = v_user_id and client_id = p_client_id;
  if not found or v_session.generation <> p_session_generation or
     v_session.membership_revision <>
       collab_v1.draw2_membership_revision(v_room_id, v_user_id) then
    raise exception 'pixync_draw2_stale_session';
  end if;
  select revision.project into v_project
  from collab_v1.draw2_game_revisions as revision
  where revision.room_id = v_room_id
    and revision.snapshot_hash = p_snapshot_hash
    and revision.revision_id = p_revision_id;
  if v_project is null then raise exception 'pixync_draw2_game_revision_not_found'; end if;
  return v_project;
end;
$$;

revoke all on function public.pixync_draw2_open_session_v1(text, text, bigint) from public, anon;
revoke all on function public.pixync_draw2_commit_operation_v1(text, text, bigint, jsonb) from public, anon;
revoke all on function public.pixync_draw2_get_operations_since_v1(text, bigint, text, bigint) from public, anon;
revoke all on function public.pixync_draw2_put_game_revision_v1(text, text, bigint, text, text, bigint, jsonb) from public, anon;
revoke all on function public.pixync_draw2_get_game_revision_v1(text, text, bigint, text, text) from public, anon;
grant execute on function public.pixync_draw2_open_session_v1(text, text, bigint) to authenticated;
grant execute on function public.pixync_draw2_commit_operation_v1(text, text, bigint, jsonb) to authenticated;
grant execute on function public.pixync_draw2_get_operations_since_v1(text, bigint, text, bigint) to authenticated;
grant execute on function public.pixync_draw2_put_game_revision_v1(text, text, bigint, text, text, bigint, jsonb) to authenticated;
grant execute on function public.pixync_draw2_get_game_revision_v1(text, text, bigint, text, text) to authenticated;
