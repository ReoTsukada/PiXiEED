-- The operator console is owned by exactly one confirmed PiXiEED account.
-- Reuse the immutable original bootstrap audit record, so an email-address
-- change cannot transfer or disable ownership.
create table if not exists public.site_owner_access (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.site_owner_access enable row level security;
revoke all on table public.site_owner_access from public, anon, authenticated;

do $$
declare
  v_user_id uuid;
  v_match_count integer;
begin
  select count(*) into v_match_count
  from public.market_audit_log audit
  join auth.users users on users.id = audit.actor_user_id
  where audit.action = 'market_admin_bootstrapped'
    and users.email_confirmed_at is not null;

  if v_match_count <> 1 then
    raise exception 'expected exactly one confirmed owner administrator account';
  end if;

  select audit.actor_user_id into v_user_id
  from public.market_audit_log audit
  join auth.users users on users.id = audit.actor_user_id
  where audit.action = 'market_admin_bootstrapped'
    and users.email_confirmed_at is not null;

  insert into public.site_owner_access(singleton, user_id)
  values (true, v_user_id)
  on conflict (singleton) do update set user_id = excluded.user_id;
end;
$$;

create or replace function public.site_current_user_is_owner_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.site_owner_access owner
    where owner.singleton and owner.user_id = auth.uid()
  );
$$;

-- All existing admin-only RPCs use this shared predicate, so they become
-- owner-only as well; the browser cannot elevate its own role.
create or replace function public.market_current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.site_current_user_is_owner_admin();
$$;

revoke all on function public.site_current_user_is_owner_admin() from public, anon, authenticated;
revoke all on function public.market_current_user_is_admin() from public, anon, authenticated;
grant execute on function public.site_current_user_is_owner_admin() to authenticated;
grant execute on function public.market_current_user_is_admin() to authenticated;
