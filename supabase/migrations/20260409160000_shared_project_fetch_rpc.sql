drop function if exists public.pixieed_get_shared_project(text);

create function public.pixieed_get_shared_project(
  target_project_key text
)
returns table (
  id uuid,
  project_key text,
  invite_token text,
  visibility text,
  owner_user_id uuid,
  title text,
  latest_snapshot jsonb,
  latest_revision bigint,
  latest_structure_revision bigint,
  latest_snapshot_revision bigint,
  latest_snapshot_structure_revision bigint,
  latest_op_seq bigint,
  checkpoint_seq bigint,
  checkpoint_created_at timestamptz,
  updated_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_project_key text := nullif(trim(target_project_key), '');
begin
  if normalized_project_key is null then
    return;
  end if;

  if auth.uid() is null or not public.pixieed_can_access_shared_project(normalized_project_key) then
    return;
  end if;

  return query
  select
    projects.id,
    projects.project_key,
    projects.invite_token,
    projects.visibility,
    projects.owner_user_id,
    projects.title,
    projects.latest_snapshot,
    projects.latest_revision,
    projects.latest_structure_revision,
    projects.latest_snapshot_revision,
    projects.latest_snapshot_structure_revision,
    projects.latest_op_seq,
    projects.checkpoint_seq,
    projects.checkpoint_created_at,
    projects.updated_at,
    projects.created_at
  from public.shared_projects as projects
  where projects.project_key = normalized_project_key
  limit 1;
end;
$$;

revoke all on function public.pixieed_get_shared_project(text) from public;
grant execute on function public.pixieed_get_shared_project(text) to authenticated;
