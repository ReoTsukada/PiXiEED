create or replace function public.pixieed_delete_owned_shared_project(target_project_key text)
returns table (
  deleted boolean,
  project_key text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_project_key text := nullif(btrim(coalesce(target_project_key, '')), '');
begin
  if current_user_id is null or normalized_project_key is null then
    return;
  end if;

  delete from public.shared_projects projects
   where projects.project_key = normalized_project_key
     and projects.owner_user_id = current_user_id;

  if found then
    return query
    select true, normalized_project_key;
  end if;
end;
$$;

revoke all on function public.pixieed_delete_owned_shared_project(text) from public;
grant execute on function public.pixieed_delete_owned_shared_project(text) to authenticated;
