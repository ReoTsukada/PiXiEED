alter table public.shared_projects
  add column if not exists id uuid default gen_random_uuid();

alter table public.shared_projects
  add column if not exists invite_token text;

alter table public.shared_projects
  add column if not exists visibility text not null default 'private';

alter table public.shared_projects
  add column if not exists latest_structure_revision bigint not null default 0;

update public.shared_projects
set invite_token = coalesce(invite_token, md5(project_key || ':' || extract(epoch from created_at)::text))
where invite_token is null;

alter table public.shared_projects
  alter column invite_token set not null;

do $$
begin
  begin
    alter table public.shared_projects
      add constraint shared_projects_id_unique unique (id);
  exception
    when duplicate_object then
      null;
  end;
  begin
    alter table public.shared_projects
      add constraint shared_projects_invite_token_unique unique (invite_token);
  exception
    when duplicate_object then
      null;
  end;
  begin
    alter table public.shared_projects
      add constraint shared_projects_visibility_check check (visibility in ('private', 'shared', 'public'));
  exception
    when duplicate_object then
      null;
  end;
end
$$;

alter table public.shared_project_members
  add column if not exists project_id uuid;

alter table public.shared_project_members
  add column if not exists last_opened_at timestamptz not null default timezone('utc', now());

update public.shared_project_members members
set project_id = projects.id
from public.shared_projects projects
where members.project_key = projects.project_key
  and members.project_id is null;

create index if not exists shared_projects_invite_token_idx
  on public.shared_projects (invite_token);

create index if not exists shared_project_members_project_id_idx
  on public.shared_project_members (project_id, user_id);

create table if not exists public.shared_project_ops (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.shared_projects(id) on delete cascade,
  revision bigint not null,
  base_revision bigint not null default 0,
  structure_revision bigint not null default 0,
  op_type text not null,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists shared_project_ops_project_revision_uidx
  on public.shared_project_ops (project_id, revision);

create index if not exists shared_project_ops_project_created_idx
  on public.shared_project_ops (project_id, created_at desc);

alter table public.shared_project_ops enable row level security;

drop policy if exists "shared_project_ops_select_member" on public.shared_project_ops;
create policy "shared_project_ops_select_member"
on public.shared_project_ops
for select
to authenticated
using (
  exists (
    select 1
    from public.shared_project_members members
    where members.project_id = shared_project_ops.project_id
      and members.user_id = auth.uid()
  )
);

drop policy if exists "shared_project_ops_insert_member" on public.shared_project_ops;
create policy "shared_project_ops_insert_member"
on public.shared_project_ops
for insert
to authenticated
with check (
  actor_user_id = auth.uid()
  and exists (
    select 1
    from public.shared_project_members members
    where members.project_id = shared_project_ops.project_id
      and members.user_id = auth.uid()
  )
);
