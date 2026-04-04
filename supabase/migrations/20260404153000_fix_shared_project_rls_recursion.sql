create or replace function public.pixieed_can_access_shared_project(target_project_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shared_projects projects
    where projects.project_key = target_project_key
      and (
        projects.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.shared_project_members members
          where members.project_key = target_project_key
            and members.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.pixieed_can_access_shared_project_id(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shared_projects projects
    where projects.id = target_project_id
      and (
        projects.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.shared_project_members members
          where members.project_key = projects.project_key
            and members.user_id = auth.uid()
        )
      )
  );
$$;

revoke all on function public.pixieed_can_access_shared_project(text) from public;
grant execute on function public.pixieed_can_access_shared_project(text) to authenticated;

revoke all on function public.pixieed_can_access_shared_project_id(uuid) from public;
grant execute on function public.pixieed_can_access_shared_project_id(uuid) to authenticated;

drop policy if exists "shared_projects_select_member" on public.shared_projects;
create policy "shared_projects_select_member"
on public.shared_projects
for select
to authenticated
using (public.pixieed_can_access_shared_project(project_key));

drop policy if exists "shared_projects_update_member" on public.shared_projects;
create policy "shared_projects_update_member"
on public.shared_projects
for update
to authenticated
using (public.pixieed_can_access_shared_project(project_key))
with check (public.pixieed_can_access_shared_project(project_key));

drop policy if exists "shared_project_members_select_project_member" on public.shared_project_members;
create policy "shared_project_members_select_project_member"
on public.shared_project_members
for select
to authenticated
using (
  user_id = auth.uid()
  or public.pixieed_can_access_shared_project(project_key)
);

drop policy if exists "shared_project_ops_select_member" on public.shared_project_ops;
create policy "shared_project_ops_select_member"
on public.shared_project_ops
for select
to authenticated
using (public.pixieed_can_access_shared_project_id(project_id));

drop policy if exists "shared_project_ops_insert_member" on public.shared_project_ops;
create policy "shared_project_ops_insert_member"
on public.shared_project_ops
for insert
to authenticated
with check (
  actor_user_id = auth.uid()
  and public.pixieed_can_access_shared_project_id(project_id)
);
