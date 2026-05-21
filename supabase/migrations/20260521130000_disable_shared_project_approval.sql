do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'shared_projects'
      and column_name = 'join_policy'
  ) then
    update public.shared_projects
    set join_policy = 'open'
    where coalesce(join_policy, '') <> 'open';

    alter table public.shared_projects
      alter column join_policy set default 'open';
  end if;

  if to_regclass('public.shared_project_members') is not null then
    update public.shared_project_members
    set role = 'editor'
    where role = 'pending';
  end if;
end $$;

drop function if exists public.pixieed_update_shared_project_join_policy(text, text);
drop function if exists public.pixieed_approve_shared_project_member(text, uuid);

alter table if exists public.shared_project_members
  drop constraint if exists shared_project_members_role_check;

alter table if exists public.shared_project_members
  add constraint shared_project_members_role_check
  check (role in ('owner', 'editor', 'viewer'));

drop policy if exists "shared_project_members_insert_self" on public.shared_project_members;
create policy "shared_project_members_insert_self"
on public.shared_project_members
for insert
to authenticated
with check (
  user_id = auth.uid()
  and role = 'editor'
  and exists (
    select 1
    from public.shared_projects as projects
    where projects.project_key = shared_project_members.project_key
  )
);
