create table if not exists public.site_owner_admin_passcode (
  singleton boolean primary key default true check (singleton),
  passcode_hash text not null,
  configured_at timestamptz not null default timezone('utc', now())
);

alter table public.site_owner_admin_passcode enable row level security;
revoke all on table public.site_owner_admin_passcode from public, anon, authenticated;

create or replace function public.site_owner_admin_passcode_configured()
returns boolean language sql stable security definer set search_path = public as $$
  select public.site_current_user_is_owner_admin()
    and exists (select 1 from public.site_owner_admin_passcode where singleton);
$$;

create or replace function public.site_owner_admin_set_passcode(input_passcode text)
returns void language plpgsql security definer set search_path = public as $$
declare v_passcode text := coalesce(input_passcode, '');
begin
  if not public.site_current_user_is_owner_admin() then raise exception 'owner admin permission required'; end if;
  if char_length(v_passcode) < 6 or char_length(v_passcode) > 64 then raise exception 'passcode must be between 6 and 64 characters'; end if;
  if exists (select 1 from public.site_owner_admin_passcode where singleton) then raise exception 'owner admin passcode already configured'; end if;
  insert into public.site_owner_admin_passcode(singleton, passcode_hash)
  values (true, crypt(v_passcode, gen_salt('bf', 12)));
end;
$$;

create or replace function public.site_owner_admin_verify_passcode(input_passcode text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.site_current_user_is_owner_admin()
    and exists (
      select 1 from public.site_owner_admin_passcode
      where singleton and passcode_hash = crypt(coalesce(input_passcode, ''), passcode_hash)
    );
$$;

revoke all on function public.site_owner_admin_passcode_configured() from public, anon, authenticated;
revoke all on function public.site_owner_admin_set_passcode(text) from public, anon, authenticated;
revoke all on function public.site_owner_admin_verify_passcode(text) from public, anon, authenticated;
grant execute on function public.site_owner_admin_passcode_configured() to authenticated;
grant execute on function public.site_owner_admin_set_passcode(text) to authenticated;
grant execute on function public.site_owner_admin_verify_passcode(text) to authenticated;
