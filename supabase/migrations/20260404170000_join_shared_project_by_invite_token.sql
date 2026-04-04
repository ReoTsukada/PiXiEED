create or replace function public.pixieed_join_shared_project_by_invite_token(
  target_invite_token text
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
  updated_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_invite_token text := nullif(trim(target_invite_token), '');
  project_row public.shared_projects%rowtype;
begin
  if current_user_id is null or normalized_invite_token is null then
    return;
  end if;

  select *
  into project_row
  from public.shared_projects
  where shared_projects.invite_token = normalized_invite_token;

  if not found then
    return;
  end if;

  insert into public.shared_project_members (
    project_key,
    project_id,
    user_id,
    role,
    last_opened_at
  )
  values (
    project_row.project_key,
    project_row.id,
    current_user_id,
    case when project_row.owner_user_id = current_user_id then 'owner' else 'editor' end,
    timezone('utc', now())
  )
  on conflict (project_key, user_id) do update
  set
    project_id = excluded.project_id,
    role = excluded.role,
    last_opened_at = excluded.last_opened_at;

  return query
  select
    project_row.id,
    project_row.project_key,
    project_row.invite_token,
    project_row.visibility,
    project_row.owner_user_id,
    project_row.title,
    project_row.latest_snapshot,
    project_row.latest_revision,
    project_row.latest_structure_revision,
    project_row.updated_at,
    project_row.created_at;
end;
$$;

revoke all on function public.pixieed_join_shared_project_by_invite_token(text) from public;
grant execute on function public.pixieed_join_shared_project_by_invite_token(text) to authenticated;
