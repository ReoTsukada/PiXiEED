-- UNAPPLIED LOCAL PROPOSAL. Requires the existing reviewed puzzle-publication
-- rollout and independent real-DB verification before any production approval.
-- Does not create Auth users, policies, buckets, public grants, or legacy rows.
begin;

do $jigsaw_contract$
declare
  fn regprocedure;
  definition text;
  old_fragment text;
  new_fragment text;
  table_name text;
  constraint_name text;
  actual_constraint text;
  -- Intentionally empty pending read-only catalog inspection in the permitted
  -- verification DB. Insert four independently reviewed, exact
  -- pg_get_constraintdef values here before testing this proposal. Never fill
  -- this map automatically from the database being modified.
  approved_constraints constant jsonb := '{}'::jsonb;
begin
  -- Exact named constraints are prerequisites. Unknown live schemas stop here;
  -- never drop another constraint or guess its replacement.
  for table_name, constraint_name in values
    ('user_posts','user_posts_submission_puzzle_mode_check'),
    ('post_map_points','post_map_points_puzzle_mode_check'),
    ('user_post_puzzles','user_post_puzzles_mode_check'),
    ('user_post_puzzles','user_post_puzzles_changed_image_valid')
  loop
    if not exists(select 1 from pg_catalog.pg_constraint c
      where c.conrelid = to_regclass('public.' || table_name)
        and c.conname = constraint_name and c.contype = 'c') then
      raise exception 'jigsaw_prerequisite_constraint_missing: %', constraint_name;
    end if;
    select pg_get_constraintdef(c.oid,false) into actual_constraint
      from pg_catalog.pg_constraint c
      where c.conrelid = to_regclass('public.' || table_name) and c.conname = constraint_name;
    if not (approved_constraints ? constraint_name) then
      raise exception 'jigsaw_constraint_review_required: %', constraint_name;
    end if;
    if approved_constraints->>constraint_name is distinct from actual_constraint then
      raise exception 'jigsaw_constraint_definition_changed: %', constraint_name;
    end if;
  end loop;

  fn := to_regprocedure('public.pixieed_valid_puzzle_source(text,jsonb)');
  if fn is null then raise exception 'jigsaw_source_validator_missing'; end if;
  definition := pg_get_functiondef(fn);
  old_fragment := 'elsif p_mode = ''hidden_object'' then';
  new_fragment := 'elsif p_mode in (''hidden_object'', ''jigsaw'') then';
  if (length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment) <> 1 then
    raise exception 'jigsaw_source_validator_changed';
  end if;
  execute replace(definition,old_fragment,new_fragment);

  fn := to_regprocedure('public.pixieed_valid_puzzle_definition(text,jsonb)');
  if fn is null then raise exception 'jigsaw_definition_validator_missing'; end if;
  definition := pg_get_functiondef(fn);
  old_fragment := '  if p_mode = ''spot_difference'' then';
  new_fragment := $definition_branch$  if p_mode = 'jigsaw' then
    return public.pixieed_json_object_size(p_definition) = 7
      and p_definition ?& array['schemaVersion','width','height','confirmed','layoutVersion','pieceSize','seed']
      and p_definition->'layoutVersion' = '1'::jsonb
      and jsonb_typeof(p_definition->'width') = 'number'
      and jsonb_typeof(p_definition->'height') = 'number'
      and jsonb_typeof(p_definition->'pieceSize') = 'number'
      and coalesce(p_definition->>'pieceSize','') ~ '^[0-9]{1,3}$'
      and (p_definition->>'pieceSize')::integer between 3 and greatest(v_width,v_height)
      and jsonb_typeof(p_definition->'seed') = 'string'
      and coalesce(p_definition->>'seed','') ~ '^[A-Za-z0-9_-]{1,128}$'
      and greatest(1,v_width / (p_definition->>'pieceSize')::integer)
        * greatest(1,v_height / (p_definition->>'pieceSize')::integer) <= 4096;
  end if;
  if p_mode = 'spot_difference' then$definition_branch$;
  if (length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment) <> 1 then
    raise exception 'jigsaw_definition_validator_changed';
  end if;
  execute replace(definition,old_fragment,new_fragment);

  fn := to_regprocedure('public.pixieed_create_post(jsonb,jsonb,jsonb)');
  if fn is null then raise exception 'jigsaw_create_rpc_missing'; end if;
  definition := pg_get_functiondef(fn);
  old_fragment := 'p_puzzle->>''mode'' not in (''spot_difference'',''hidden_object'')';
  new_fragment := 'p_puzzle->>''mode'' not in (''spot_difference'',''hidden_object'',''jigsaw'')';
  if (length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment) <> 1 then
    raise exception 'jigsaw_create_rpc_changed';
  end if;
  execute replace(definition,old_fragment,new_fragment);

  fn := to_regprocedure('public.pixieed_moderate_post(uuid,text,text,jsonb,text)');
  if fn is null then raise exception 'jigsaw_moderation_rpc_missing'; end if;
  definition := pg_get_functiondef(fn);
  old_fragment := 'v_puzzle.mode = ''hidden_object'' and p_changed_public_path is not null';
  new_fragment := 'v_puzzle.mode <> ''spot_difference'' and p_changed_public_path is not null';
  if (length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment) <> 1 then
    raise exception 'jigsaw_moderation_rpc_changed';
  end if;
  execute replace(definition,old_fragment,new_fragment);
end
$jigsaw_contract$;

alter table public.user_posts drop constraint user_posts_submission_puzzle_mode_check;
alter table public.user_posts add constraint user_posts_submission_puzzle_mode_check
  check (submission_puzzle_mode is null or submission_puzzle_mode in ('spot_difference','hidden_object','jigsaw'));
alter table public.post_map_points drop constraint post_map_points_puzzle_mode_check;
alter table public.post_map_points add constraint post_map_points_puzzle_mode_check
  check (puzzle_mode is null or puzzle_mode in ('spot_difference','hidden_object','jigsaw'));
alter table public.user_post_puzzles drop constraint user_post_puzzles_mode_check;
alter table public.user_post_puzzles add constraint user_post_puzzles_mode_check
  check (mode in ('spot_difference','hidden_object','jigsaw'));
alter table public.user_post_puzzles drop constraint user_post_puzzles_changed_image_valid;
alter table public.user_post_puzzles add constraint user_post_puzzles_changed_image_valid check (
  (mode in ('hidden_object','jigsaw') and changed_image_path is null and changed_image_claim is null)
  or (mode = 'spot_difference' and changed_image_path is not null
    and char_length(changed_image_path) between 1 and 512
    and changed_image_path !~ '(^/|\.\.|\\|[?#])' and changed_image_path ~ '\.png$'
    and public.pixieed_valid_image_claim(changed_image_claim))
);

-- Existing service-only privilege boundary remains explicit. No client RPC or
-- table access is introduced by adding the mode.
revoke all on function public.pixieed_valid_puzzle_source(text,jsonb) from public,anon,authenticated;
revoke all on function public.pixieed_valid_puzzle_definition(text,jsonb) from public,anon,authenticated;
revoke all on function public.pixieed_create_post(jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.pixieed_moderate_post(uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.pixieed_valid_puzzle_source(text,jsonb) to service_role;
grant execute on function public.pixieed_valid_puzzle_definition(text,jsonb) to service_role;
grant execute on function public.pixieed_create_post(jsonb,jsonb,jsonb) to service_role;
grant execute on function public.pixieed_moderate_post(uuid,text,text,jsonb,text) to service_role;
commit;
