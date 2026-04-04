create or replace function public.pixieed_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.shared_projects (
  project_key text primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  latest_snapshot jsonb,
  latest_revision bigint not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.shared_project_members (
  project_key text not null references public.shared_projects(project_key) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  joined_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (project_key, user_id)
);

create index if not exists shared_projects_updated_at_idx
  on public.shared_projects (updated_at desc);

create index if not exists shared_project_members_user_id_idx
  on public.shared_project_members (user_id, updated_at desc);

drop trigger if exists shared_projects_touch_updated_at on public.shared_projects;
create trigger shared_projects_touch_updated_at
before update on public.shared_projects
for each row
execute function public.pixieed_touch_updated_at();

drop trigger if exists shared_project_members_touch_updated_at on public.shared_project_members;
create trigger shared_project_members_touch_updated_at
before update on public.shared_project_members
for each row
execute function public.pixieed_touch_updated_at();

alter table public.shared_projects enable row level security;
alter table public.shared_project_members enable row level security;

drop policy if exists "shared_projects_select_member" on public.shared_projects;
create policy "shared_projects_select_member"
on public.shared_projects
for select
to authenticated
using (
  exists (
    select 1
    from public.shared_project_members as members
    where members.project_key = shared_projects.project_key
      and members.user_id = auth.uid()
  )
);

drop policy if exists "shared_projects_insert_owner" on public.shared_projects;
create policy "shared_projects_insert_owner"
on public.shared_projects
for insert
to authenticated
with check (owner_user_id = auth.uid());

drop policy if exists "shared_projects_update_member" on public.shared_projects;
create policy "shared_projects_update_member"
on public.shared_projects
for update
to authenticated
using (
  exists (
    select 1
    from public.shared_project_members as members
    where members.project_key = shared_projects.project_key
      and members.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.shared_project_members as members
    where members.project_key = shared_projects.project_key
      and members.user_id = auth.uid()
  )
);

drop policy if exists "shared_project_members_select_project_member" on public.shared_project_members;
create policy "shared_project_members_select_project_member"
on public.shared_project_members
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.shared_project_members as members
    where members.project_key = shared_project_members.project_key
      and members.user_id = auth.uid()
  )
);

drop policy if exists "shared_project_members_insert_self" on public.shared_project_members;
create policy "shared_project_members_insert_self"
on public.shared_project_members
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.shared_projects as projects
    where projects.project_key = shared_project_members.project_key
  )
);

drop policy if exists "shared_project_members_update_owner_or_self" on public.shared_project_members;
create policy "shared_project_members_update_owner_or_self"
on public.shared_project_members
for update
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.shared_projects as projects
    where projects.project_key = shared_project_members.project_key
      and projects.owner_user_id = auth.uid()
  )
)
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.shared_projects as projects
    where projects.project_key = shared_project_members.project_key
      and projects.owner_user_id = auth.uid()
  )
);
