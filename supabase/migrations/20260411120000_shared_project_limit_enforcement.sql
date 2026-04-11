create table if not exists public.user_shared_project_limit_grace (
  user_id uuid primary key references auth.users(id) on delete cascade,
  effective_limit integer not null default 1 check (effective_limit >= 1),
  warned_at timestamptz not null default timezone('utc', now()),
  grace_until timestamptz not null default (timezone('utc', now()) + interval '7 days'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists user_shared_project_limit_grace_touch_updated_at on public.user_shared_project_limit_grace;
create trigger user_shared_project_limit_grace_touch_updated_at
before update on public.user_shared_project_limit_grace
for each row
execute function public.pixieed_touch_updated_at();

alter table public.user_shared_project_limit_grace enable row level security;

drop policy if exists "user_shared_project_limit_grace_select_own" on public.user_shared_project_limit_grace;
create policy "user_shared_project_limit_grace_select_own"
on public.user_shared_project_limit_grace
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.pixieed_enforce_shared_project_limit()
returns table (
  effective_limit integer,
  owned_project_count integer,
  over_limit boolean,
  grace_active boolean,
  warned_at timestamptz,
  grace_until timestamptz,
  deleted_project_keys text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  now_utc timestamptz := timezone('utc', now());
  current_limit integer := 1;
  current_count integer := 0;
  grace_row public.user_shared_project_limit_grace%rowtype;
  deleted_keys text[] := array[]::text[];
  deleted_count integer := 0;
begin
  if current_user_id is null then
    return;
  end if;

  select case
      when exists (
        select 1
        from public.user_entitlements entitlements
        where entitlements.user_id = current_user_id
          and entitlements.entitlement_key in ('pixiedraw_ad_free', 'browser_ad_free')
          and entitlements.revoked_at is null
          and coalesce(entitlements.status, 'active') = 'active'
          and (
            entitlements.expires_at is null
            or entitlements.expires_at > now_utc
          )
      ) then 3
      else 1
    end
    into current_limit;

  select count(*)
    into current_count
    from public.shared_projects projects
   where projects.owner_user_id = current_user_id;

  if current_count <= current_limit then
    delete from public.user_shared_project_limit_grace
     where user_id = current_user_id;

    return query
    select
      current_limit,
      current_count,
      false,
      false,
      null::timestamptz,
      null::timestamptz,
      deleted_keys;
    return;
  end if;

  select *
    into grace_row
    from public.user_shared_project_limit_grace grace
   where grace.user_id = current_user_id
   for update;

  if not found or grace_row.effective_limit <> current_limit then
    insert into public.user_shared_project_limit_grace (
      user_id,
      effective_limit,
      warned_at,
      grace_until
    )
    values (
      current_user_id,
      current_limit,
      now_utc,
      now_utc + interval '7 days'
    )
    on conflict (user_id) do update
    set
      effective_limit = excluded.effective_limit,
      warned_at = excluded.warned_at,
      grace_until = excluded.grace_until,
      updated_at = now_utc
    returning *
      into grace_row;
  end if;

  if grace_row.grace_until > now_utc then
    return query
    select
      current_limit,
      current_count,
      true,
      true,
      grace_row.warned_at,
      grace_row.grace_until,
      deleted_keys;
    return;
  end if;

  with overflow_projects as (
    select projects.project_key
    from public.shared_projects projects
    where projects.owner_user_id = current_user_id
    order by projects.updated_at asc, projects.created_at asc, projects.project_key asc
    limit greatest(current_count - current_limit, 0)
  ),
  deleted as (
    delete from public.shared_projects projects
    using overflow_projects
    where projects.project_key = overflow_projects.project_key
    returning projects.project_key
  )
  select coalesce(array_agg(deleted.project_key order by deleted.project_key), array[]::text[]), count(*)
    into deleted_keys, deleted_count
    from deleted;

  select count(*)
    into current_count
    from public.shared_projects projects
   where projects.owner_user_id = current_user_id;

  if current_count <= current_limit then
    delete from public.user_shared_project_limit_grace
     where user_id = current_user_id;
  else
    update public.user_shared_project_limit_grace grace
       set warned_at = now_utc,
           grace_until = now_utc + interval '7 days',
           effective_limit = current_limit
     where grace.user_id = current_user_id
     returning *
      into grace_row;
  end if;

  return query
  select
    current_limit,
    current_count,
    current_count > current_limit,
    false,
    case when current_count > current_limit then grace_row.warned_at else null::timestamptz end,
    case when current_count > current_limit then grace_row.grace_until else null::timestamptz end,
    deleted_keys;
end;
$$;

grant execute on function public.pixieed_enforce_shared_project_limit() to authenticated;
